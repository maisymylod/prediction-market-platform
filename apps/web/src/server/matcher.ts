import { eq } from 'drizzle-orm';
import { createLogger, hasAnthropicCreds, type VenueName } from '@pmp/core';
import { proposeMatches, type MarketForMatch } from '@pmp/venues/matcher';
import {
  venues as venuesTable,
  markets as marketsTable,
  eventLinks as eventLinksTable,
  eventLinkMarkets as eventLinkMarketsTable,
} from '@pmp/db';
import { db } from './db.js';
import { env } from './config.js';

const log = createLogger(env.LOG_LEVEL, { mod: 'matcher' });

export class MatcherDisabledError extends Error {
  constructor() {
    super('Matcher disabled: ANTHROPIC_API_KEY not set');
  }
}

/**
 * Ask the LLM to propose cross-venue matches among markets not already in a
 * CONFIRMED link, then persist each as an UNCONFIRMED link awaiting manual
 * confirm. Never auto-trusts a match in risk calculations.
 */
export async function suggestMatches(): Promise<number> {
  if (!hasAnthropicCreds(env)) throw new MatcherDisabledError();

  const [venueRows, marketRows, linkMarketRows, linkRows] = await Promise.all([
    db.select().from(venuesTable),
    db.select().from(marketsTable),
    db.select().from(eventLinkMarketsTable),
    db.select().from(eventLinksTable),
  ]);

  const venueName = new Map<number, VenueName>(venueRows.map((v) => [v.id, v.name]));
  const confirmedLinkIds = new Set(linkRows.filter((l) => l.confirmed).map((l) => l.id));
  const confirmedMarketIds = new Set(
    linkMarketRows.filter((lm) => confirmedLinkIds.has(lm.eventLinkId)).map((lm) => lm.marketId),
  );

  const toMatch = (venue: VenueName): MarketForMatch[] =>
    marketRows
      .filter((m) => venueName.get(m.venueId) === venue && !confirmedMarketIds.has(m.id))
      .map((m) => ({
        id: String(m.id),
        venue,
        ticker: m.externalTicker,
        question: m.question,
        category: m.category,
        resolutionCriteria: m.resolutionCriteria,
        resolutionDate: m.resolutionDate ? m.resolutionDate.toISOString() : null,
      }));

  const left = toMatch('kalshi');
  const right = toMatch('polymarket');
  if (left.length === 0 || right.length === 0) return 0;

  const candidates = await proposeMatches({
    apiKey: env.ANTHROPIC_API_KEY!,
    model: env.ANTHROPIC_MODEL,
    left,
    right,
    logger: log,
  });

  // Avoid re-proposing an identical UNCONFIRMED pair already pending.
  const pendingPairs = new Set(
    linkRows
      .filter((l) => !l.confirmed)
      .flatMap((l) => {
        const ms = linkMarketRows.filter((lm) => lm.eventLinkId === l.id).map((lm) => lm.marketId);
        return ms.length === 2 ? [`${Math.min(...ms)}:${Math.max(...ms)}`] : [];
      }),
  );

  let created = 0;
  for (const c of candidates) {
    const leftId = Number(c.leftId);
    const rightId = Number(c.rightId);
    const key = `${Math.min(leftId, rightId)}:${Math.max(leftId, rightId)}`;
    if (pendingPairs.has(key)) continue;

    const [link] = await db
      .insert(eventLinksTable)
      .values({
        canonicalQuestion: c.label,
        confidence: c.confidence.toFixed(4),
        rationale: c.rationale,
        source: 'llm',
        confirmed: false,
        resolutionMismatch: c.resolutionMismatch,
      })
      .returning({ id: eventLinksTable.id });
    if (!link) continue;
    await db.insert(eventLinkMarketsTable).values([
      { eventLinkId: link.id, marketId: leftId, alignment: 'direct' },
      { eventLinkId: link.id, marketId: rightId, alignment: 'direct' },
    ]);
    created += 1;
  }
  log.info('matcher suggested links', { proposed: candidates.length, created });
  return created;
}

/** Manual confirm: an unconfirmed link becomes trusted in risk calculations. */
export async function confirmLink(eventLinkId: number): Promise<void> {
  await db
    .update(eventLinksTable)
    .set({ confirmed: true, confirmedAt: new Date() })
    .where(eq(eventLinksTable.id, eventLinkId));
}

/** Reject a proposed link (cascades to its market mappings). */
export async function rejectLink(eventLinkId: number): Promise<void> {
  await db.delete(eventLinksTable).where(eq(eventLinksTable.id, eventLinkId));
}
