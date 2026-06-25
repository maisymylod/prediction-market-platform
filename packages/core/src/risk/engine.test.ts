import { describe, it, expect } from 'vitest';
import type { LinkedEvent, MarketSnapshot, PositionInput } from '../types/index.js';
import {
  computePositions,
  computeTotals,
  computeExposure,
  computeConcentration,
  computeWorstCase,
  computeBasis,
  computeRisk,
} from './engine.js';

// --- builders ---------------------------------------------------------------
const snap = (marketId: string, mark: number | null, stale = false): MarketSnapshot => ({
  marketId,
  venue: marketId.startsWith('k') ? 'kalshi' : 'polymarket',
  yesBid: mark,
  yesAsk: mark,
  mark,
  ts: 1_000,
  stale,
});

const pos = (o: Partial<PositionInput> & Pick<PositionInput, 'marketId' | 'side' | 'quantity' | 'avgPrice'>): PositionInput => ({
  positionId: o.positionId ?? `p_${o.marketId}_${o.side}`,
  venue: o.venue ?? (o.marketId.startsWith('k') ? 'kalshi' : 'polymarket'),
  category: o.category,
  cluster: o.cluster,
  ...o,
});

const marks = (...s: MarketSnapshot[]) => new Map(s.map((x) => [x.marketId, x]));

// ---------------------------------------------------------------------------
describe('computePositions / totals / exposure', () => {
  const positions = [
    pos({ marketId: 'kA', side: 'yes', quantity: 200, avgPrice: 0.45, category: 'Econ' }),
    pos({ marketId: 'pB', side: 'no', quantity: 150, avgPrice: 0.5, category: 'Crypto' }),
  ];
  const m = marks(snap('kA', 0.5), snap('pB', 0.51));
  const rows = computePositions(positions, (id) => m.get(id));

  it('prices a YES position', () => {
    const r = rows[0]!;
    expect(r.contractValue).toBeCloseTo(0.5, 10); // mark
    expect(r.marketValue).toBeCloseTo(100, 10); // 200 * 0.50
    expect(r.costBasis).toBeCloseTo(90, 10); // 200 * 0.45
    expect(r.unrealizedPnl).toBeCloseTo(10, 10);
    expect(r.unrealizedPnlPct).toBeCloseTo(10 / 90, 10);
  });

  it('prices a NO position as 1 - mark', () => {
    const r = rows[1]!;
    expect(r.contractValue).toBeCloseTo(0.49, 10); // 1 - 0.51
    expect(r.marketValue).toBeCloseTo(73.5, 10); // 150 * 0.49
    expect(r.costBasis).toBeCloseTo(75, 10); // 150 * 0.50
    expect(r.unrealizedPnl).toBeCloseTo(-1.5, 10);
  });

  it('totals sum priced rows', () => {
    const t = computeTotals(rows);
    expect(t.marketValue).toBeCloseTo(173.5, 10);
    expect(t.costBasis).toBeCloseTo(165, 10);
    expect(t.unrealizedPnl).toBeCloseTo(8.5, 10);
    expect(t.unpricedCount).toBe(0);
  });

  it('exposure splits long/short and nets', () => {
    const e = computeExposure(rows);
    expect(e.longValue).toBeCloseTo(100, 10);
    expect(e.shortValue).toBeCloseTo(73.5, 10);
    expect(e.grossExposure).toBeCloseTo(173.5, 10);
    expect(e.netExposure).toBeCloseTo(26.5, 10);
  });
});

describe('missing marks and stale flags', () => {
  const positions = [
    pos({ marketId: 'kA', side: 'yes', quantity: 100, avgPrice: 0.4 }),
    pos({ marketId: 'kMISSING', side: 'yes', quantity: 50, avgPrice: 0.2 }),
  ];
  const m = marks(snap('kA', 0.6, true)); // priced but stale; kMISSING absent
  const rows = computePositions(positions, (id) => m.get(id));

  it('excludes unpriced from value but keeps cost basis', () => {
    const t = computeTotals(rows);
    expect(t.unpricedCount).toBe(1);
    expect(t.staleCount).toBe(1);
    // marketValue only from kA: 100 * 0.6 = 60
    expect(t.marketValue).toBeCloseTo(60, 10);
    // costBasis includes the unpriced one: 100*0.4 + 50*0.2 = 50
    expect(t.costBasis).toBeCloseTo(50, 10);
  });

  it('marks the unpriced row not priced with null pnl', () => {
    const missing = rows[1]!;
    expect(missing.priced).toBe(false);
    expect(missing.marketValue).toBeNull();
    expect(missing.unrealizedPnl).toBeNull();
    expect(missing.costBasis).toBeCloseTo(10, 10);
  });

  it('zero quantity contributes nothing', () => {
    const z = computePositions([pos({ marketId: 'kA', side: 'yes', quantity: 0, avgPrice: 0.4 })], (id) => m.get(id));
    const t = computeTotals(z);
    expect(t.marketValue).toBe(0);
    expect(t.costBasis).toBe(0);
    expect(z[0]!.unrealizedPnlPct).toBeNull(); // zero basis -> null, not Infinity
  });
});

describe('concentration', () => {
  const positions = [
    pos({ marketId: 'kA', side: 'yes', quantity: 200, avgPrice: 0.45, category: 'Econ', cluster: 'Macro' }),
    pos({ marketId: 'pB', side: 'no', quantity: 150, avgPrice: 0.5, category: 'Crypto', cluster: 'Macro' }),
  ];
  const m = marks(snap('kA', 0.5), snap('pB', 0.51));
  const rows = computePositions(positions, (id) => m.get(id));

  it('groups by category with shares summing to 1', () => {
    const c = computeConcentration(rows, positions);
    const econ = c.byCategory.find((g) => g.key === 'Econ')!;
    const crypto = c.byCategory.find((g) => g.key === 'Crypto')!;
    expect(econ.value).toBeCloseTo(100, 10);
    expect(crypto.value).toBeCloseTo(73.5, 10);
    expect(econ.pct + crypto.pct).toBeCloseTo(1, 10);
    expect(econ.pct).toBeCloseTo(100 / 173.5, 10);
  });

  it('collapses a shared cluster', () => {
    const c = computeConcentration(rows, positions);
    expect(c.byCluster).toHaveLength(1);
    expect(c.byCluster[0]!.key).toBe('Macro');
    expect(c.byCluster[0]!.value).toBeCloseTo(173.5, 10);
    expect(c.byCluster[0]!.pct).toBeCloseTo(1, 10);
  });
});

describe('worst-case loss', () => {
  const link = (over: Partial<LinkedEvent>): LinkedEvent => ({
    eventLinkId: 'L1',
    label: 'Event L1',
    confirmed: true,
    resolutionMismatch: false,
    legs: [
      { marketId: 'kA', venue: 'kalshi', alignment: 'direct' },
      { marketId: 'pB', venue: 'polymarket', alignment: 'direct' },
    ],
    ...over,
  });
  const positions = [
    pos({ marketId: 'kA', side: 'yes', quantity: 100, avgPrice: 0.4 }),
    pos({ marketId: 'pB', side: 'no', quantity: 100, avgPrice: 0.55 }),
  ];

  it('a confirmed hedge locks a non-negative outcome', () => {
    const w = computeWorstCase(positions, [link({})]);
    // YES: (+60) + (-55) = +5 ; NO: (-40) + (+45) = +5
    expect(w.byEvent).toHaveLength(1);
    expect(w.byEvent[0]!.worstPnl).toBeCloseTo(5, 10);
    expect(w.worstCasePnl).toBeCloseTo(5, 10);
    expect(w.worstCaseLoss).toBe(0);
  });

  it('a resolution-mismatch link is NOT treated as a hedge', () => {
    const w = computeWorstCase(positions, [link({ resolutionMismatch: true })]);
    // independent: kA worst = -40, pB worst = -55
    expect(w.worstCasePnl).toBeCloseTo(-95, 10);
    expect(w.worstCaseLoss).toBeCloseTo(95, 10);
  });

  it('an unconfirmed link is NOT treated as a hedge', () => {
    const w = computeWorstCase(positions, [link({ confirmed: false })]);
    expect(w.worstCaseLoss).toBeCloseTo(95, 10);
  });

  it('handles inverse alignment in the hedge', () => {
    // pB phrased opposite: a NO on pB(inverse) behaves like a YES on the event.
    const inv = link({
      legs: [
        { marketId: 'kA', venue: 'kalshi', alignment: 'direct' },
        { marketId: 'pB', venue: 'polymarket', alignment: 'inverse' },
      ],
    });
    // both long the event: kA yes 100@0.40, pB no 100@0.55 inverse => marketYes=!eventYes
    // eventYes: kA +60 ; pB marketYes=false => no pays 1 => +45 => total +105
    // eventNo:  kA -40 ; pB marketYes=true  => no pays 0 => -55 => total -95
    const w = computeWorstCase(positions, [inv]);
    expect(w.worstCasePnl).toBeCloseTo(-95, 10);
    expect(w.byEvent[0]!.worstOutcome).toBe('no');
  });

  it('a single unlinked position resolves against the trader', () => {
    const w = computeWorstCase([pos({ marketId: 'kZ', side: 'yes', quantity: 50, avgPrice: 0.2 })], []);
    // YES: 50 - 10 = +40 ; NO: 0 - 10 = -10 => worst -10
    expect(w.worstCaseLoss).toBeCloseTo(10, 10);
  });
});

describe('cross-venue basis', () => {
  const baseLink: LinkedEvent = {
    eventLinkId: 'L1',
    label: 'Fed cut',
    confirmed: true,
    resolutionMismatch: false,
    legs: [
      { marketId: 'kA', venue: 'kalshi', alignment: 'direct' },
      { marketId: 'pB', venue: 'polymarket', alignment: 'direct' },
    ],
  };

  it('flags a basis above threshold', () => {
    const m = marks(snap('kA', 0.48), snap('pB', 0.55));
    const [r] = computeBasis([baseLink], (id) => m.get(id), 0.05);
    expect(r!.basis).toBeCloseTo(0.07, 10);
    expect(r!.flagged).toBe(true);
    expect(r!.resolutionMismatch).toBe(false);
  });

  it('applies inverse alignment before comparing', () => {
    const link: LinkedEvent = {
      ...baseLink,
      legs: [
        { marketId: 'kA', venue: 'kalshi', alignment: 'direct' },
        { marketId: 'pB', venue: 'polymarket', alignment: 'inverse' },
      ],
    };
    const m = marks(snap('kA', 0.48), snap('pB', 0.55)); // pB yesEquiv = 0.45
    const [r] = computeBasis([link], (id) => m.get(id), 0.05);
    expect(r!.legs[1]!.yesEquiv).toBeCloseTo(0.45, 10);
    expect(r!.basis).toBeCloseTo(0.03, 10);
    expect(r!.flagged).toBe(false);
  });

  it('returns null basis when a leg is unpriced', () => {
    const m = marks(snap('kA', 0.48)); // pB missing
    const [r] = computeBasis([baseLink], (id) => m.get(id), 0.05);
    expect(r!.basis).toBeNull();
    expect(r!.flagged).toBe(false);
  });

  it('surfaces staleness and excludes unconfirmed links', () => {
    const m = marks(snap('kA', 0.48, true), snap('pB', 0.55));
    const stale = computeBasis([baseLink], (id) => m.get(id), 0.05);
    expect(stale[0]!.stale).toBe(true);
    const none = computeBasis([{ ...baseLink, confirmed: false }], (id) => m.get(id), 0.05);
    expect(none).toHaveLength(0);
  });
});

describe('computeRisk end-to-end', () => {
  it('assembles every section', () => {
    const positions = [pos({ marketId: 'kA', side: 'yes', quantity: 100, avgPrice: 0.4, category: 'Econ' })];
    const m = marks(snap('kA', 0.5));
    const result = computeRisk({ positions, marks: m, links: [], basisThreshold: 0.05 });
    expect(result.positions).toHaveLength(1);
    expect(result.totals.marketValue).toBeCloseTo(50, 10);
    expect(result.exposure.grossExposure).toBeCloseTo(50, 10);
    expect(result.worstCase.worstCaseLoss).toBeCloseTo(40, 10); // 100@0.40: NO outcome = 0 - 40 = -40
    expect(result.concentration.byCategory[0]!.key).toBe('Econ');
    expect(result.basis).toHaveLength(0);
  });
});
