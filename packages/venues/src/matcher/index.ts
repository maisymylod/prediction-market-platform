import Anthropic from '@anthropic-ai/sdk';
import type { Logger } from '@pmp/core';
import {
  buildMatcherUserMessage,
  candidatesSchema,
  normalizeCandidates,
  MATCHER_SYSTEM,
  MATCHER_TOOL_SCHEMA,
  type Candidate,
  type MarketForMatch,
} from './prompt.js';

export * from './prompt.js';

export interface MatcherOptions {
  apiKey: string;
  model: string;
  left: MarketForMatch[];
  right: MarketForMatch[];
  logger?: Logger;
}

/**
 * LLM-assisted candidate pairing. Forces a single tool call so the model returns
 * structured, schema-validated candidates. NEVER auto-confirms — the caller
 * persists these as UNCONFIRMED links awaiting a manual confirm click.
 */
export async function proposeMatches(opts: MatcherOptions): Promise<Candidate[]> {
  if (opts.left.length === 0 || opts.right.length === 0) return [];

  const client = new Anthropic({ apiKey: opts.apiKey });
  const response = await client.messages.create({
    model: opts.model,
    max_tokens: 2048,
    system: MATCHER_SYSTEM,
    tools: [
      {
        name: 'propose_matches',
        description: 'Propose cross-venue market matches with confidence and rationale.',
        input_schema: MATCHER_TOOL_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: 'propose_matches' },
    messages: [{ role: 'user', content: buildMatcherUserMessage(opts.left, opts.right) }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    opts.logger?.warn('matcher returned no tool_use block');
    return [];
  }

  const parsed = candidatesSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    opts.logger?.warn('matcher output failed validation');
    return [];
  }

  return normalizeCandidates(
    parsed.data.candidates,
    new Set(opts.left.map((m) => m.id)),
    new Set(opts.right.map((m) => m.id)),
  );
}
