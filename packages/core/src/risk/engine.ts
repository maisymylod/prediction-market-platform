import type { LinkedEvent, MarketSnapshot, PositionInput } from '../types/index.js';
import { contractPayoff, contractValue } from './contracts.js';
import type {
  BasisResult,
  ConcentrationGroup,
  ConcentrationResult,
  EventWorstCase,
  ExposureResult,
  PortfolioTotals,
  PositionRisk,
  RiskResult,
  WorstCaseResult,
} from './types.js';

export interface RiskInputs {
  positions: PositionInput[];
  /** Latest snapshot per market, keyed by marketId. */
  marks: ReadonlyMap<string, MarketSnapshot> | Record<string, MarketSnapshot>;
  /** Cross-venue links. Only CONFIRMED links affect aggregates. */
  links: LinkedEvent[];
  /** Basis flag threshold (probability points), e.g. 0.05. */
  basisThreshold: number;
}

function markGetter(
  marks: ReadonlyMap<string, MarketSnapshot> | Record<string, MarketSnapshot>,
): (id: string) => MarketSnapshot | undefined {
  if (marks instanceof Map) return (id) => marks.get(id);
  return (id) => (marks as Record<string, MarketSnapshot>)[id];
}

// ---------------------------------------------------------------------------
// Position-level P&L
// ---------------------------------------------------------------------------
export function computePositions(
  positions: PositionInput[],
  getMark: (id: string) => MarketSnapshot | undefined,
): PositionRisk[] {
  return positions.map((pos) => {
    const snap = getMark(pos.marketId);
    const mark = snap?.mark ?? null;
    const priced = mark !== null;
    const stale = priced ? (snap?.stale ?? false) : false;
    const costBasis = pos.quantity * pos.avgPrice;

    if (mark === null) {
      return {
        positionId: pos.positionId,
        marketId: pos.marketId,
        venue: pos.venue,
        side: pos.side,
        quantity: pos.quantity,
        avgPrice: pos.avgPrice,
        mark: null,
        stale: false,
        priced: false,
        contractValue: null,
        marketValue: null,
        costBasis,
        unrealizedPnl: null,
        unrealizedPnlPct: null,
      };
    }

    const cv = contractValue(pos.side, mark);
    const marketValue = pos.quantity * cv;
    const unrealizedPnl = marketValue - costBasis;
    const unrealizedPnlPct = costBasis !== 0 ? unrealizedPnl / costBasis : null;

    return {
      positionId: pos.positionId,
      marketId: pos.marketId,
      venue: pos.venue,
      side: pos.side,
      quantity: pos.quantity,
      avgPrice: pos.avgPrice,
      mark,
      stale,
      priced,
      contractValue: cv,
      marketValue,
      costBasis,
      unrealizedPnl,
      unrealizedPnlPct,
    };
  });
}

export function computeTotals(rows: PositionRisk[]): PortfolioTotals {
  let marketValue = 0;
  let costBasis = 0;
  let unrealizedPnl = 0;
  let unpricedCount = 0;
  let staleCount = 0;
  for (const r of rows) {
    costBasis += r.costBasis;
    if (!r.priced) {
      unpricedCount += 1;
      continue;
    }
    marketValue += r.marketValue ?? 0;
    unrealizedPnl += r.unrealizedPnl ?? 0;
    if (r.stale) staleCount += 1;
  }
  return { marketValue, costBasis, unrealizedPnl, unpricedCount, staleCount };
}

export function computeExposure(rows: PositionRisk[]): ExposureResult {
  let longValue = 0;
  let shortValue = 0;
  for (const r of rows) {
    if (!r.priced || r.marketValue === null) continue;
    if (r.side === 'yes') longValue += r.marketValue;
    else shortValue += r.marketValue;
  }
  return {
    grossExposure: longValue + shortValue,
    netExposure: longValue - shortValue,
    longValue,
    shortValue,
  };
}

// ---------------------------------------------------------------------------
// Concentration
// ---------------------------------------------------------------------------
function groupConcentration(
  rows: PositionRisk[],
  positions: PositionInput[],
  pick: (p: PositionInput) => string,
): ConcentrationGroup[] {
  const byId = new Map(positions.map((p) => [p.positionId, p]));
  const totals = new Map<string, number>();
  let grand = 0;
  for (const r of rows) {
    if (!r.priced || r.marketValue === null) continue;
    const p = byId.get(r.positionId);
    const key = (p ? pick(p) : undefined) || 'Uncategorized';
    const v = Math.abs(r.marketValue);
    totals.set(key, (totals.get(key) ?? 0) + v);
    grand += v;
  }
  return [...totals.entries()]
    .map(([key, value]) => ({ key, value, pct: grand > 0 ? value / grand : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function computeConcentration(
  rows: PositionRisk[],
  positions: PositionInput[],
): ConcentrationResult {
  return {
    byCategory: groupConcentration(rows, positions, (p) => p.category ?? 'Uncategorized'),
    byCluster: groupConcentration(rows, positions, (p) => p.cluster ?? 'Uncategorized'),
  };
}

// ---------------------------------------------------------------------------
// Worst-case loss (outcome-based; needs no marks). Hedged legs of the SAME
// confirmed, non-mismatched event offset each other; mismatched or unconfirmed
// links are treated as independent single-market groups (conservative).
// ---------------------------------------------------------------------------
export function computeWorstCase(
  positions: PositionInput[],
  links: LinkedEvent[],
): WorstCaseResult {
  // marketId -> { groupKey, alignment } for grouping eligible links only.
  const marketToGroup = new Map<string, { key: string; label: string }>();
  const marketAlignment = new Map<string, 'direct' | 'inverse'>();
  for (const link of links) {
    if (!link.confirmed || link.resolutionMismatch) continue; // only true hedges
    for (const leg of link.legs) {
      marketToGroup.set(leg.marketId, { key: `link:${link.eventLinkId}`, label: link.label });
      marketAlignment.set(leg.marketId, leg.alignment);
    }
  }

  // Bucket positions into groups.
  interface Group {
    key: string;
    label: string;
    positions: PositionInput[];
  }
  const groups = new Map<string, Group>();
  for (const pos of positions) {
    const grouped = marketToGroup.get(pos.marketId);
    const key = grouped?.key ?? `market:${pos.marketId}`;
    const label = grouped?.label ?? pos.marketId;
    let g = groups.get(key);
    if (!g) {
      g = { key, label, positions: [] };
      groups.set(key, g);
    }
    g.positions.push(pos);
  }

  const byEvent: EventWorstCase[] = [];
  let worstCasePnl = 0;
  for (const g of groups.values()) {
    // Evaluate the two event resolutions. For grouped links, alignment maps the
    // event outcome to each market's YES outcome. For singletons, alignment is
    // 'direct' so the event outcome IS the market outcome.
    const pnlForOutcome = (eventYes: boolean): number => {
      let pnl = 0;
      for (const pos of g.positions) {
        const align = marketAlignment.get(pos.marketId) ?? 'direct';
        const marketYes = align === 'direct' ? eventYes : !eventYes;
        const payoff = pos.quantity * contractPayoff(pos.side, marketYes);
        const cost = pos.quantity * pos.avgPrice;
        pnl += payoff - cost;
      }
      return pnl;
    };
    const yesPnl = pnlForOutcome(true);
    const noPnl = pnlForOutcome(false);
    const worstOutcome = yesPnl <= noPnl ? 'yes' : 'no';
    const worstPnl = Math.min(yesPnl, noPnl);
    byEvent.push({ key: g.key, label: g.label, worstPnl, worstOutcome });
    worstCasePnl += worstPnl;
  }

  byEvent.sort((a, b) => a.worstPnl - b.worstPnl);
  return { worstCasePnl, worstCaseLoss: Math.max(0, -worstCasePnl), byEvent };
}

// ---------------------------------------------------------------------------
// Cross-venue basis (confirmed links only)
// ---------------------------------------------------------------------------
export function computeBasis(
  links: LinkedEvent[],
  getMark: (id: string) => MarketSnapshot | undefined,
  threshold: number,
): BasisResult[] {
  const out: BasisResult[] = [];
  for (const link of links) {
    if (!link.confirmed) continue; // never use unconfirmed links in risk
    let anyStale = false;
    const legs = link.legs.map((leg) => {
      const snap = getMark(leg.marketId);
      const rawMark = snap?.mark ?? null;
      const stale = rawMark !== null ? (snap?.stale ?? false) : false;
      if (stale) anyStale = true;
      const yesEquiv =
        rawMark === null ? null : leg.alignment === 'direct' ? rawMark : 1 - rawMark;
      return { venue: leg.venue, marketId: leg.marketId, rawMark, yesEquiv, stale };
    });

    const priced = legs.filter((l) => l.yesEquiv !== null).map((l) => l.yesEquiv as number);
    // Basis is defined for exactly-two-priced legs (the v1 pairwise view).
    const basis =
      priced.length >= 2 ? Math.abs(Math.max(...priced) - Math.min(...priced)) : null;

    out.push({
      eventLinkId: link.eventLinkId,
      label: link.label,
      legs,
      basis,
      flagged: basis !== null && basis > threshold,
      stale: anyStale,
      resolutionMismatch: link.resolutionMismatch,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Top-level aggregator
// ---------------------------------------------------------------------------
export function computeRisk(inputs: RiskInputs): RiskResult {
  const getMark = markGetter(inputs.marks);
  const positions = computePositions(inputs.positions, getMark);
  return {
    positions,
    totals: computeTotals(positions),
    exposure: computeExposure(positions),
    worstCase: computeWorstCase(inputs.positions, inputs.links),
    concentration: computeConcentration(positions, inputs.positions),
    basis: computeBasis(inputs.links, getMark, inputs.basisThreshold),
  };
}
