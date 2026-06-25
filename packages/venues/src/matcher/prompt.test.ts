import { describe, it, expect } from 'vitest';
import {
  buildMatcherUserMessage,
  candidatesSchema,
  normalizeCandidates,
  type Candidate,
  type MarketForMatch,
} from './prompt.js';

const kalshi: MarketForMatch[] = [
  { id: 'k1', venue: 'kalshi', ticker: 'KXFED', question: 'Fed cut in Dec?', category: 'Economics' },
];
const poly: MarketForMatch[] = [
  { id: 'p1', venue: 'polymarket', ticker: '0xfed', question: 'Fed decreases rates Dec?' },
];

describe('buildMatcherUserMessage', () => {
  it('lists both venues with ids and questions', () => {
    const msg = buildMatcherUserMessage(kalshi, poly);
    expect(msg).toContain('KALSHI MARKETS');
    expect(msg).toContain('id=k1');
    expect(msg).toContain('POLYMARKET MARKETS');
    expect(msg).toContain('id=p1');
    expect(msg).toContain('Fed cut in Dec?');
  });
  it('handles an empty side', () => {
    expect(buildMatcherUserMessage(kalshi, [])).toContain('(none)');
  });
});

describe('candidatesSchema', () => {
  it('rejects out-of-range confidence', () => {
    const bad = { candidates: [{ leftId: 'k1', rightId: 'p1', confidence: 2, rationale: 'x', resolutionMismatch: false, label: 'L' }] };
    expect(candidatesSchema.safeParse(bad).success).toBe(false);
  });
});

describe('normalizeCandidates', () => {
  const valid = (over: Partial<Candidate>): Candidate => ({
    leftId: 'k1',
    rightId: 'p1',
    confidence: 0.9,
    rationale: 'same event',
    resolutionMismatch: false,
    label: 'Fed cut',
    ...over,
  });

  it('drops candidates referencing unknown ids', () => {
    const out = normalizeCandidates(
      [valid({ leftId: 'ghost' })],
      new Set(['k1']),
      new Set(['p1']),
    );
    expect(out).toHaveLength(0);
  });

  it('dedupes pairs and sorts by confidence desc', () => {
    const out = normalizeCandidates(
      [valid({ confidence: 0.6 }), valid({ confidence: 0.6 }), valid({ leftId: 'k1', rightId: 'p1', confidence: 0.95 })],
      new Set(['k1']),
      new Set(['p1']),
    );
    expect(out).toHaveLength(1); // same pair deduped
    expect(out[0]!.confidence).toBeCloseTo(0.6, 10); // first occurrence kept
  });

  it('keeps valid distinct pairs', () => {
    const out = normalizeCandidates(
      [valid({}), valid({ rightId: 'p2' })],
      new Set(['k1']),
      new Set(['p1', 'p2']),
    );
    expect(out).toHaveLength(2);
  });
});
