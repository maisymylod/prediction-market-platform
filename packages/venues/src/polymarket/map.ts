import type { ClobPrice } from './schemas.js';

// Pure mapping helpers for Polymarket prices (already probabilities in [0,1]).

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function parsePrice(p: ClobPrice['price'] | null | undefined): number | null {
  if (p === null || p === undefined) return null;
  const n = typeof p === 'number' ? p : Number(p);
  if (!Number.isFinite(n)) return null;
  return clamp01(n);
}

/** Combine buy (ask) and sell (bid) into a quote with a mid mark. */
export function quoteFrom(
  buy: number | null,
  sell: number | null,
): { yesBid: number | null; yesAsk: number | null; mark: number | null } {
  const yesAsk = buy;
  const yesBid = sell;
  let mark: number | null;
  if (yesBid !== null && yesAsk !== null) mark = clamp01((yesBid + yesAsk) / 2);
  else mark = yesAsk ?? yesBid;
  return { yesBid, yesAsk, mark };
}
