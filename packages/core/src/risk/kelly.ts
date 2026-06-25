import type { KellyResult } from './types.js';

// Reference HALF-KELLY sizing for a single binary contract. THIS IS A REFERENCE
// NUMBER, NOT ADVICE. Given a user probability estimate `w` of YES and the live
// YES price `p`, the full-Kelly fraction of bankroll for a YES bet is:
//   f* = (w - p) / (1 - p)
// (risk p to gain (1-p); net odds b = (1-p)/p). By symmetry, if the edge favors
// NO, we size the NO side at price (1-p) with estimate (1-w). We surface half of
// f*, clamped to [0,1].

export function halfKelly(probability: number, price: number): KellyResult {
  const w = clamp01(probability);
  const p = clamp01(price);
  const edge = w - p;

  // Degenerate prices: no finite Kelly fraction.
  if (p <= 0 || p >= 1) {
    return {
      probability: w,
      price: p,
      edge,
      fullKelly: 0,
      halfKelly: 0,
      side: 'none',
      note: 'Price at 0 or 1 — no reference size. Not financial advice.',
    };
  }

  if (edge > 0) {
    const full = clamp01(edge / (1 - p));
    return {
      probability: w,
      price: p,
      edge,
      fullKelly: full,
      halfKelly: full / 2,
      side: 'yes',
      note: 'Reference half-Kelly for the YES side. Not financial advice.',
    };
  }

  if (edge < 0) {
    // Edge favors NO: estimate of NO is (1-w), NO price is (1-p).
    const wNo = 1 - w;
    const pNo = 1 - p;
    const full = clamp01((wNo - pNo) / (1 - pNo));
    return {
      probability: w,
      price: p,
      edge,
      fullKelly: full,
      halfKelly: full / 2,
      side: 'no',
      note: 'Reference half-Kelly for the NO side. Not financial advice.',
    };
  }

  return {
    probability: w,
    price: p,
    edge: 0,
    fullKelly: 0,
    halfKelly: 0,
    side: 'none',
    note: 'No edge at this price. Not financial advice.',
  };
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
