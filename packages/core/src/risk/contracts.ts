import type { Side } from '../types/index.js';

// Per-contract mechanics for binary event contracts. Each contract pays $1 on a
// favorable resolution, $0 otherwise. A market's `mark` is its YES probability
// in [0,1]; a NO contract is worth (1 - mark).

/** Current value of one contract of the given side at a YES mark. */
export function contractValue(side: Side, mark: number): number {
  return side === 'yes' ? mark : 1 - mark;
}

/**
 * Payoff per contract if the position's MARKET resolves YES (`marketYes=true`)
 * or NO (`marketYes=false`). YES contracts pay 1 on YES; NO contracts pay 1 on NO.
 */
export function contractPayoff(side: Side, marketYes: boolean): number {
  if (side === 'yes') return marketYes ? 1 : 0;
  return marketYes ? 0 : 1;
}
