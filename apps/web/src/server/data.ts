import {
  computeRisk,
  type LinkedEvent,
  type MarketSnapshot,
  type PositionInput,
  type VenueName,
} from '@pmp/core';
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
import type { BasisRow, DashboardModel, FeedRow, PositionRow } from './types.js';

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
 * Load everything the dashboard needs, convert numerics at the DB boundary, run
 * the pure risk engine, and assemble display view-models. The injected `now`
 * (ms) drives staleness — the engine itself never reads a clock.
 */
export async function loadDashboard(now: number = Date.now()): Promise<DashboardModel> {
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

  // --- marks (latest snapshot per market) ---
  const marks = new Map<string, MarketSnapshot>();
  for (const s of snapRows) {
    const market = marketById.get(s.marketId);
    if (!market) continue;
    const ts = s.ts.getTime();
    marks.set(String(s.marketId), {
      marketId: String(s.marketId),
      venue: venueName.get(market.venueId) ?? 'kalshi',
      yesBid: num(s.yesBid),
      yesAsk: num(s.yesAsk),
      mark: num(s.mark),
      ts,
      stale: now - ts > env.STALE_THRESHOLD_MS,
    });
  }

  // --- positions -> risk inputs ---
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

  // --- links -> LinkedEvent[] ---
  const legsByLink = new Map<number, { marketId: string; venue: VenueName; alignment: 'direct' | 'inverse' }[]>();
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

  const risk = computeRisk({
    positions: positionInputs,
    marks,
    links,
    basisThreshold: env.BASIS_THRESHOLD,
  });

  // --- enrich positions for display ---
  const inputById = new Map(positionInputs.map((p) => [p.positionId, p]));
  const positions: PositionRow[] = risk.positions.map((r) => {
    const market = marketById.get(Number(r.marketId));
    const input = inputById.get(r.positionId);
    return {
      ...r,
      ticker: market?.externalTicker ?? r.marketId,
      question: market?.question ?? r.marketId,
      category: input?.category ?? 'Uncategorized',
      cluster: input?.cluster ?? 'Other',
      resolutionDate: market?.resolutionDate ? market.resolutionDate.toISOString() : null,
      status: market?.status ?? 'active',
      markTs: marks.get(r.marketId)?.ts ?? null,
    };
  });

  // --- enrich basis legs for display ---
  const basis: BasisRow[] = risk.basis.map((b) => ({
    eventLinkId: b.eventLinkId,
    label: b.label,
    basis: b.basis,
    flagged: b.flagged,
    stale: b.stale,
    resolutionMismatch: b.resolutionMismatch,
    legs: b.legs.map((leg) => {
      const market = marketById.get(Number(leg.marketId));
      return {
        venue: leg.venue,
        marketId: leg.marketId,
        ticker: market?.externalTicker ?? leg.marketId,
        question: market?.question ?? leg.marketId,
        rawMark: leg.rawMark,
        yesEquiv: leg.yesEquiv,
        stale: leg.stale,
      };
    }),
  }));

  const feeds: FeedRow[] = feedRows.map((f) => {
    const ageMs = f.lastMessageAt ? now - f.lastMessageAt.getTime() : null;
    return {
      venue: f.venue,
      channel: f.channel,
      state: f.state,
      lastMessageAt: f.lastMessageAt ? f.lastMessageAt.toISOString() : null,
      ageMs,
    };
  });

  return {
    generatedAt: new Date(now).toISOString(),
    totals: risk.totals,
    exposure: risk.exposure,
    worstCase: risk.worstCase,
    concentration: risk.concentration,
    positions,
    basis,
    feeds,
    staleThresholdMs: env.STALE_THRESHOLD_MS,
    basisThreshold: env.BASIS_THRESHOLD,
    pendingLinkCount: linkRows.filter((l) => !l.confirmed).length,
  };
}
