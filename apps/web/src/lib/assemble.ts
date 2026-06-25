import {
  computeRisk,
  freshnessFor,
  type MarketSnapshot,
  type PositionInput,
  type LinkedEvent,
} from '@pmp/core';
import type {
  BasisRow,
  DashboardModel,
  FeedLite,
  FeedRow,
  MarketMeta,
  MarkLite,
  PendingLink,
  PositionRow,
} from '../server/types.js';

export interface AssembleParams {
  now: number;
  markets: MarketMeta[];
  positionInputs: PositionInput[];
  links: LinkedEvent[];
  marks: MarkLite[];
  feeds: FeedLite[];
  basisThreshold: number;
  staleThresholdMs: number;
  pendingLinks: PendingLink[];
  matcherEnabled: boolean;
}

/**
 * PURE: build the full dashboard view-model from raw inputs + a clock value.
 * Used identically by server SSR and by the browser on each live recompute, so
 * there is exactly one definition of how marks become risk numbers.
 */
export function assembleDashboard(p: AssembleParams): DashboardModel {
  const metaById = new Map(p.markets.map((m) => [m.marketId, m]));

  // marks -> MarketSnapshot map with staleness derived from the clock.
  const snapshots = new Map<string, MarketSnapshot>();
  for (const m of p.marks) {
    snapshots.set(m.marketId, {
      marketId: m.marketId,
      venue: m.venue,
      yesBid: m.yesBid,
      yesAsk: m.yesAsk,
      mark: m.mark,
      ts: m.ts,
      stale: p.now - m.ts > p.staleThresholdMs,
    });
  }

  const risk = computeRisk({
    positions: p.positionInputs,
    marks: snapshots,
    links: p.links,
    basisThreshold: p.basisThreshold,
  });

  const inputById = new Map(p.positionInputs.map((x) => [x.positionId, x]));
  const positions: PositionRow[] = risk.positions.map((r) => {
    const meta = metaById.get(r.marketId);
    const input = inputById.get(r.positionId);
    return {
      ...r,
      ticker: meta?.ticker ?? r.marketId,
      question: meta?.question ?? r.marketId,
      category: input?.category ?? meta?.category ?? 'Uncategorized',
      cluster: input?.cluster ?? meta?.cluster ?? 'Other',
      resolutionDate: meta?.resolutionDate ?? null,
      status: meta?.status ?? 'active',
      markTs: snapshots.get(r.marketId)?.ts ?? null,
    };
  });

  const basis: BasisRow[] = risk.basis.map((b) => ({
    eventLinkId: b.eventLinkId,
    label: b.label,
    basis: b.basis,
    flagged: b.flagged,
    stale: b.stale,
    resolutionMismatch: b.resolutionMismatch,
    legs: b.legs.map((leg) => {
      const meta = metaById.get(leg.marketId);
      return {
        venue: leg.venue,
        marketId: leg.marketId,
        ticker: meta?.ticker ?? leg.marketId,
        question: meta?.question ?? leg.marketId,
        rawMark: leg.rawMark,
        yesEquiv: leg.yesEquiv,
        stale: leg.stale,
      };
    }),
  }));

  // Derive feed freshness from timestamps + the clock — never trust a stored
  // "live" if messages have actually stopped (e.g. the worker died). Honor a
  // worker-signalled 'reconnecting' only while the feed is otherwise fresh.
  const feeds: FeedRow[] = p.feeds.map((f) => {
    const derived = freshnessFor(f.lastMessageAt, p.now, p.staleThresholdMs);
    const state =
      f.state === 'reconnecting' && derived === 'live' ? 'reconnecting' : derived;
    return {
      venue: f.venue,
      channel: f.channel,
      state,
      lastMessageAt: f.lastMessageAt ? new Date(f.lastMessageAt).toISOString() : null,
      ageMs: f.lastMessageAt ? p.now - f.lastMessageAt : null,
    };
  });

  return {
    generatedAt: new Date(p.now).toISOString(),
    totals: risk.totals,
    exposure: risk.exposure,
    worstCase: risk.worstCase,
    concentration: risk.concentration,
    positions,
    basis,
    feeds,
    staleThresholdMs: p.staleThresholdMs,
    basisThreshold: p.basisThreshold,
    pendingLinks: p.pendingLinks,
    matcherEnabled: p.matcherEnabled,
  };
}
