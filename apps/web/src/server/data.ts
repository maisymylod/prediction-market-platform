import { hasAnthropicCreds, type LinkedEvent, type PositionInput, type VenueName } from '@pmp/core';
import {
  venues as venuesTable,
  markets as marketsTable,
  positions as positionsTable,
  eventLinks as eventLinksTable,
  eventLinkMarkets as eventLinkMarketsTable,
  feedStatus as feedStatusTable,
  latestSnapshots,
} from '@pmp/db';
import { db } from './db.js';
import { env } from './config.js';
import { assembleDashboard } from '../lib/assemble.js';
import type {
  DashboardModel,
  FeedLite,
  LiveBootstrap,
  MarketMeta,
  MarkLite,
  PendingLink,
} from './types.js';

const num = (s: string | null): number | null => (s === null ? null : Number(s));

/** Coarse thematic clusters for concentration grouping. */
function clusterFor(category: string | null): string {
  switch (category) {
    case 'Economics':
    case 'Crypto':
      return 'Macro';
    case 'Politics':
      return 'Politics';
    case 'Sports':
      return 'Sports';
    default:
      return 'Other';
  }
}

/**
 * Load everything from the DB, convert numerics at the boundary, and build the
 * serializable LiveBootstrap. The dashboard model is assembled by the SAME pure
 * function the browser uses on each live recompute.
 */
export async function loadBootstrap(now: number = Date.now()): Promise<LiveBootstrap> {
  const [venueRows, marketRows, positionRows, linkRows, linkMarketRows, snapRows, feedRows] =
    await Promise.all([
      db.select().from(venuesTable),
      db.select().from(marketsTable),
      db.select().from(positionsTable),
      db.select().from(eventLinksTable),
      db.select().from(eventLinkMarketsTable),
      latestSnapshots(db),
      db.select().from(feedStatusTable),
    ]);

  const venueName = new Map<number, VenueName>(venueRows.map((v) => [v.id, v.name]));
  const marketById = new Map(marketRows.map((m) => [m.id, m]));

  const markets: MarketMeta[] = marketRows.map((m) => ({
    marketId: String(m.id),
    venue: venueName.get(m.venueId) ?? 'kalshi',
    ticker: m.externalTicker,
    question: m.question,
    category: m.category ?? 'Uncategorized',
    cluster: clusterFor(m.category),
    resolutionDate: m.resolutionDate ? m.resolutionDate.toISOString() : null,
    status: m.status,
  }));

  const marks: MarkLite[] = snapRows
    .filter((s) => marketById.has(s.marketId))
    .map((s) => {
      const market = marketById.get(s.marketId)!;
      return {
        marketId: String(s.marketId),
        venue: venueName.get(market.venueId) ?? 'kalshi',
        yesBid: num(s.yesBid),
        yesAsk: num(s.yesAsk),
        mark: num(s.mark),
        ts: s.ts.getTime(),
      };
    });

  const positionInputs: PositionInput[] = positionRows.map((p) => {
    const market = marketById.get(p.marketId);
    const category = market?.category ?? null;
    return {
      positionId: String(p.id),
      venue: venueName.get(p.venueId) ?? 'kalshi',
      marketId: String(p.marketId),
      side: p.side,
      quantity: Number(p.quantity),
      avgPrice: Number(p.avgPrice),
      category: category ?? 'Uncategorized',
      cluster: clusterFor(category),
    };
  });

  const legsByLink = new Map<number, LinkedEvent['legs']>();
  for (const lm of linkMarketRows) {
    const market = marketById.get(lm.marketId);
    if (!market) continue;
    const legs = legsByLink.get(lm.eventLinkId) ?? [];
    legs.push({
      marketId: String(lm.marketId),
      venue: venueName.get(market.venueId) ?? 'kalshi',
      alignment: lm.alignment,
    });
    legsByLink.set(lm.eventLinkId, legs);
  }
  const links: LinkedEvent[] = linkRows.map((l) => ({
    eventLinkId: String(l.id),
    label: l.canonicalQuestion,
    legs: legsByLink.get(l.id) ?? [],
    confirmed: l.confirmed,
    resolutionMismatch: l.resolutionMismatch,
  }));

  const feeds: FeedLite[] = feedRows.map((f) => ({
    venue: f.venue,
    channel: f.channel,
    state: f.state,
    lastMessageAt: f.lastMessageAt ? f.lastMessageAt.getTime() : null,
  }));

  const pendingLinks: PendingLink[] = linkRows
    .filter((l) => !l.confirmed)
    .map((l) => ({
      eventLinkId: String(l.id),
      label: l.canonicalQuestion,
      confidence: l.confidence === null ? null : Number(l.confidence),
      rationale: l.rationale,
      resolutionMismatch: l.resolutionMismatch,
      legs: (legsByLink.get(l.id) ?? []).map((leg) => {
        const market = marketById.get(Number(leg.marketId));
        return {
          venue: leg.venue,
          ticker: market?.externalTicker ?? leg.marketId,
          question: market?.question ?? leg.marketId,
        };
      }),
    }));

  return {
    positionInputs,
    links,
    markets,
    marks,
    feeds,
    basisThreshold: env.BASIS_THRESHOLD,
    staleThresholdMs: env.STALE_THRESHOLD_MS,
    pendingLinks,
    matcherEnabled: hasAnthropicCreds(env),
  };
}

/** SSR convenience: bootstrap + the initial assembled model. */
export async function loadDashboard(
  now: number = Date.now(),
): Promise<{ model: DashboardModel; bootstrap: LiveBootstrap }> {
  const bootstrap = await loadBootstrap(now);
  const model = assembleDashboard({ now, ...bootstrap });
  return { model, bootstrap };
}
