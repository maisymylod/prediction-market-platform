import type {
  PositionRisk,
  PortfolioTotals,
  ExposureResult,
  WorstCaseResult,
  ConcentrationResult,
  VenueName,
} from '@pmp/core';

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
