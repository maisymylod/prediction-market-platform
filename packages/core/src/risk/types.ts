import type { Side, VenueName } from '../types/index.js';

// Result shapes returned by the pure risk engine. All money values are in
// dollars (each contract pays out $1 on a favorable resolution). All
// probabilities are in [0,1].

export interface PositionRisk {
  positionId: string;
  marketId: string;
  venue: VenueName;
  side: Side;
  quantity: number;
  avgPrice: number;
  /** YES mark for the market, or null if unpriced. */
  mark: number | null;
  /** True when a mark exists but is older than the staleness threshold. */
  stale: boolean;
  /** True when a usable mark exists. */
  priced: boolean;
  /** Current value of one contract of this side, or null if unpriced. */
  contractValue: number | null;
  /** quantity * contractValue, or null if unpriced. */
  marketValue: number | null;
  /** quantity * avgPrice. Always computable. */
  costBasis: number;
  /** marketValue - costBasis, or null if unpriced. */
  unrealizedPnl: number | null;
  /** unrealizedPnl / costBasis, or null if unpriced or zero basis. */
  unrealizedPnlPct: number | null;
}

export interface PortfolioTotals {
  /** Sum of priced market values. */
  marketValue: number;
  /** Sum of all cost bases (priced or not). */
  costBasis: number;
  /** Sum of priced unrealized P&L. */
  unrealizedPnl: number;
  /** Positions with no usable mark (excluded from value/pnl aggregates). */
  unpricedCount: number;
  /** Priced positions whose mark is stale. */
  staleCount: number;
}

export interface ExposureResult {
  /** Sum of |marketValue| across priced positions. */
  grossExposure: number;
  /** Signed YES-equivalent value: +marketValue for YES, -marketValue for NO. */
  netExposure: number;
  /** Total current value of YES-side positions. */
  longValue: number;
  /** Total current value of NO-side positions. */
  shortValue: number;
}

export interface EventWorstCase {
  /** Group key: event link id (`link:<id>`) or single market (`market:<id>`). */
  key: string;
  label: string;
  /** Worst (most negative) aggregate P&L for this group across resolutions. */
  worstPnl: number;
  /** The resolution outcome that produces the worst P&L. */
  worstOutcome: 'yes' | 'no';
}

export interface WorstCaseResult {
  /** Signed worst-case portfolio P&L (negative is a loss). */
  worstCasePnl: number;
  /** Magnitude of loss: max(0, -worstCasePnl). */
  worstCaseLoss: number;
  byEvent: EventWorstCase[];
}

export interface ConcentrationGroup {
  key: string;
  value: number;
  /** Share of total grouped value in [0,1]. */
  pct: number;
}

export interface ConcentrationResult {
  byCategory: ConcentrationGroup[];
  byCluster: ConcentrationGroup[];
}

export interface BasisLeg {
  venue: VenueName;
  marketId: string;
  /** Raw YES mark from the venue, or null if unpriced. */
  rawMark: number | null;
  /** YES-equivalent probability after applying leg alignment (inverse = 1-p). */
  yesEquiv: number | null;
  stale: boolean;
}

export interface BasisResult {
  eventLinkId: string;
  label: string;
  legs: BasisLeg[];
  /** Absolute gap between the two YES-equivalent legs, or null if unpriced. */
  basis: number | null;
  /** True when basis exceeds the configured threshold. */
  flagged: boolean;
  /** True when at least one leg's mark is stale. */
  stale: boolean;
  /** True when the legs' resolution criteria are known to differ — a real trap. */
  resolutionMismatch: boolean;
}

export interface KellyResult {
  /** User-supplied probability estimate of YES. */
  probability: number;
  /** Live YES price used. */
  price: number;
  /** Edge = probability - price. */
  edge: number;
  /** Full Kelly fraction of bankroll for the implied side. */
  fullKelly: number;
  /** Half Kelly — the reference number we surface. */
  halfKelly: number;
  /** Which side the edge favors at this price. */
  side: 'yes' | 'no' | 'none';
  note: string;
}

export interface RiskResult {
  positions: PositionRisk[];
  totals: PortfolioTotals;
  exposure: ExposureResult;
  worstCase: WorstCaseResult;
  concentration: ConcentrationResult;
  basis: BasisResult[];
}
