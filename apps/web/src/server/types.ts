import type {
  PositionRisk,
  PortfolioTotals,
  ExposureResult,
  WorstCaseResult,
  ConcentrationResult,
  VenueName,
  PositionInput,
  LinkedEvent,
} from '@pmp/core';

/** Serializable mark passed to the browser; staleness derived from ts + now. */
export interface MarkLite {
  marketId: string;
  venue: VenueName;
  yesBid: number | null;
  yesAsk: number | null;
  mark: number | null;
  /** Epoch ms. */
  ts: number;
}

/** Serializable feed health row; ageMs derived from lastMessageAt + now. */
export interface FeedLite {
  venue: VenueName;
  channel: string;
  state: 'live' | 'stale' | 'reconnecting' | 'down';
  lastMessageAt: number | null;
}

/** Per-market display metadata (immutable for a session). */
export interface MarketMeta {
  marketId: string;
  venue: VenueName;
  ticker: string;
  question: string;
  category: string;
  cluster: string;
  resolutionDate: string | null;
  status: string;
}

/**
 * Everything the browser needs to recompute the dashboard locally as marks
 * arrive — sent once on SSR, then mutated by SSE deltas. No secrets.
 */
export interface LiveBootstrap {
  positionInputs: PositionInput[];
  links: LinkedEvent[];
  markets: MarketMeta[];
  marks: MarkLite[];
  feeds: FeedLite[];
  basisThreshold: number;
  staleThresholdMs: number;
}

export interface PositionRow extends PositionRisk {
  ticker: string;
  question: string;
  category: string;
  cluster: string;
  resolutionDate: string | null;
  status: string;
  /** Epoch ms of the mark used, or null if unpriced — drives live freshness. */
  markTs: number | null;
}

export interface BasisLegView {
  venue: VenueName;
  marketId: string;
  ticker: string;
  question: string;
  rawMark: number | null;
  yesEquiv: number | null;
  stale: boolean;
}

export interface BasisRow {
  eventLinkId: string;
  label: string;
  basis: number | null;
  flagged: boolean;
  stale: boolean;
  resolutionMismatch: boolean;
  legs: BasisLegView[];
}

export interface FeedRow {
  venue: VenueName;
  channel: string;
  state: 'live' | 'stale' | 'reconnecting' | 'down';
  lastMessageAt: string | null;
  ageMs: number | null;
}

export interface DashboardModel {
  generatedAt: string;
  totals: PortfolioTotals;
  exposure: ExposureResult;
  worstCase: WorstCaseResult;
  concentration: ConcentrationResult;
  positions: PositionRow[];
  basis: BasisRow[];
  feeds: FeedRow[];
  staleThresholdMs: number;
  basisThreshold: number;
  /** Unconfirmed links awaiting manual confirm (matcher, step 6). */
  pendingLinkCount: number;
}
