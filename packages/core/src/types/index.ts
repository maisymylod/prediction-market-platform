// Shared domain types. These are PLAIN data shapes with no I/O concerns.
// The DB layer (Drizzle) returns numeric columns as strings; conversion to
// `number` happens at the DB boundary so the risk engine only ever sees numbers.

export type VenueName = 'kalshi' | 'polymarket';

export type Side = 'yes' | 'no';

export type MarketStatus = 'active' | 'closed' | 'settled';

/** Health of a single ingestion feed/channel. */
export type FeedState = 'live' | 'stale' | 'reconnecting' | 'down';

/** Origin of a price snapshot. */
export type PriceSource = 'live' | 'sim' | 'reconcile';

/**
 * How a linked market's YES outcome aligns with the logical event's YES.
 * `inverse` means the venue phrased the question the opposite way, so its YES
 * price must be flipped (1 - p) before comparison.
 */
export type LegAlignment = 'direct' | 'inverse';

/** Latest price view of a single market, fed to the risk engine. */
export interface MarketSnapshot {
  marketId: string;
  venue: VenueName;
  /** Best YES bid as a probability in [0,1]. Null if the book is one-sided. */
  yesBid: number | null;
  /** Best YES ask as a probability in [0,1]. Null if the book is one-sided. */
  yesAsk: number | null;
  /** Reference mark (YES probability) in [0,1]. Null if no mark is available. */
  mark: number | null;
  /** Epoch milliseconds of the snapshot. */
  ts: number;
  /** True when this mark is older than the staleness threshold. */
  stale: boolean;
}

/** A single open position, fed to the risk engine. */
export interface PositionInput {
  positionId: string;
  venue: VenueName;
  marketId: string;
  side: Side;
  /** Number of contracts. Non-negative. */
  quantity: number;
  /** Average entry price as a probability in [0,1]. */
  avgPrice: number;
  /** Optional grouping label for concentration (e.g. "Politics", "Crypto"). */
  category?: string;
  /** Optional thematic cluster label for concentration. */
  cluster?: string;
}

/** One venue leg of a confirmed cross-venue event link. */
export interface EventLeg {
  marketId: string;
  venue: VenueName;
  alignment: LegAlignment;
}

/** A logical real-world event mapped across venues. */
export interface LinkedEvent {
  eventLinkId: string;
  label: string;
  legs: EventLeg[];
  confirmed: boolean;
  /** True when the legs' resolution criteria are known to differ. */
  resolutionMismatch: boolean;
}
