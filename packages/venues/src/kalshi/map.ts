import type { KalshiMarket, WsTicker } from './schemas.js';

// Pure mapping from Kalshi shapes to our normalized price view. Kalshi quotes in
// integer cents; we store probabilities in [0,1].

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function centToProb(c: number | null | undefined): number | null {
  if (c === null || c === undefined) return null;
  return clamp01(c / 100);
}

/** Mark = mid of bid/ask when both present, else last price, else null. */
export function markFrom(
  yesBid: number | null,
  yesAsk: number | null,
  last: number | null,
): number | null {
  if (yesBid !== null && yesAsk !== null) return clamp01((yesBid + yesAsk) / 2);
  return last;
}

export interface NormalizedTick {
  externalTicker: string;
  yesBid: number | null;
  yesAsk: number | null;
  mark: number | null;
}

/** Normalize a WS ticker message (cents -> probability). */
export function mapWsTicker(t: WsTicker): NormalizedTick {
  const yesBid = centToProb(t.msg.yes_bid ?? null);
  const yesAsk = centToProb(t.msg.yes_ask ?? null);
  const last = centToProb(t.msg.price ?? null);
  return {
    externalTicker: t.msg.market_ticker,
    yesBid,
    yesAsk,
    mark: markFrom(yesBid, yesAsk, last),
  };
}

/** Normalize a REST market row (used by reconciliation). */
export function mapRestMarket(m: KalshiMarket): NormalizedTick {
  const yesBid = centToProb(m.yes_bid ?? null);
  const yesAsk = centToProb(m.yes_ask ?? null);
  const last = centToProb(m.last_price ?? null);
  return {
    externalTicker: m.ticker,
    yesBid,
    yesAsk,
    mark: markFrom(yesBid, yesAsk, last),
  };
}
