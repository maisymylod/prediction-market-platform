import { z } from 'zod';

// Pure prompt construction + response validation for the cross-venue matcher.
// Kept I/O-free so it is unit-testable without calling the API.

export interface MarketForMatch {
  id: string;
  venue: 'kalshi' | 'polymarket';
  ticker: string;
  question: string;
  category?: string | null;
  resolutionCriteria?: string | null;
  resolutionDate?: string | null;
}

export const candidateSchema = z.object({
  leftId: z.string(),
  rightId: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  resolutionMismatch: z.boolean(),
  label: z.string(),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const candidatesSchema = z.object({ candidates: z.array(candidateSchema) });

/** JSON Schema for the Anthropic tool the model must call. */
export const MATCHER_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          leftId: { type: 'string', description: 'id of the Kalshi market' },
          rightId: { type: 'string', description: 'id of the Polymarket market' },
          confidence: { type: 'number', description: '0..1 likelihood they are the same event' },
          rationale: { type: 'string', description: 'one or two sentences' },
          resolutionMismatch: {
            type: 'boolean',
            description: 'true if resolution criteria could resolve differently',
          },
          label: { type: 'string', description: 'short canonical event label' },
        },
        required: ['leftId', 'rightId', 'confidence', 'rationale', 'resolutionMismatch', 'label'],
      },
    },
  },
  required: ['candidates'],
} as const;

export const MATCHER_SYSTEM = [
  'You match prediction-market contracts that refer to the SAME real-world event across two venues (Kalshi and Polymarket).',
  'Two questions can look identical but resolve differently (e.g. headline vs core CPI, different dates, different price sources).',
  'For each plausible pair, output a confidence in [0,1], a short rationale, and resolutionMismatch=true when the resolution criteria could diverge.',
  'Only propose pairs you actually believe match. Do not invent ids. Never pair two markets from the same venue.',
].join(' ');

function describe(m: MarketForMatch): string {
  return [
    `id=${m.id}`,
    `ticker=${m.ticker}`,
    `question="${m.question}"`,
    m.category ? `category=${m.category}` : '',
    m.resolutionDate ? `resolutionDate=${m.resolutionDate}` : '',
    m.resolutionCriteria ? `criteria="${m.resolutionCriteria}"` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

/** Build the user message listing both venues' unmatched markets. */
export function buildMatcherUserMessage(left: MarketForMatch[], right: MarketForMatch[]): string {
  const l = left.map(describe).join('\n');
  const r = right.map(describe).join('\n');
  return [
    'KALSHI MARKETS:',
    l || '(none)',
    '',
    'POLYMARKET MARKETS:',
    r || '(none)',
    '',
    'Call propose_matches with every likely cross-venue pair. leftId must be a Kalshi id, rightId a Polymarket id.',
  ].join('\n');
}

/** Validate, clamp, de-dupe and order model output. Drops ids not in the input. */
export function normalizeCandidates(
  raw: Candidate[],
  validLeftIds: Set<string>,
  validRightIds: Set<string>,
): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of raw) {
    if (!validLeftIds.has(c.leftId) || !validRightIds.has(c.rightId)) continue;
    const key = `${c.leftId}:${c.rightId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, confidence: Math.min(1, Math.max(0, c.confidence)) });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}
