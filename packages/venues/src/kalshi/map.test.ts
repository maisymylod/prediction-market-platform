import { describe, it, expect } from 'vitest';
import { centToProb, markFrom, mapWsTicker, mapRestMarket } from './map.js';
import { wsTickerSchema } from './schemas.js';

describe('centToProb', () => {
  it('converts cents to probability', () => {
    expect(centToProb(50)).toBeCloseTo(0.5, 10);
    expect(centToProb(1)).toBeCloseTo(0.01, 10);
  });
  it('passes through null/undefined', () => {
    expect(centToProb(null)).toBeNull();
    expect(centToProb(undefined)).toBeNull();
  });
  it('clamps out-of-range values', () => {
    expect(centToProb(150)).toBe(1);
    expect(centToProb(-10)).toBe(0);
  });
});

describe('markFrom', () => {
  it('mids bid/ask when both present', () => {
    expect(markFrom(0.48, 0.52, null)).toBeCloseTo(0.5, 10);
  });
  it('falls back to last when one side missing', () => {
    expect(markFrom(0.48, null, 0.49)).toBeCloseTo(0.49, 10);
    expect(markFrom(null, null, 0.3)).toBeCloseTo(0.3, 10);
  });
  it('null when nothing usable', () => {
    expect(markFrom(null, null, null)).toBeNull();
  });
});

describe('mapWsTicker', () => {
  it('normalizes a full ticker message', () => {
    const msg = wsTickerSchema.parse({
      type: 'ticker',
      msg: { market_ticker: 'KXTEST', yes_bid: 48, yes_ask: 52, price: 50, ts: 1700 },
    });
    const t = mapWsTicker(msg);
    expect(t.externalTicker).toBe('KXTEST');
    expect(t.yesBid).toBeCloseTo(0.48, 10);
    expect(t.yesAsk).toBeCloseTo(0.52, 10);
    expect(t.mark).toBeCloseTo(0.5, 10);
  });

  it('uses last price when book is one-sided', () => {
    const msg = wsTickerSchema.parse({
      type: 'ticker',
      msg: { market_ticker: 'KXTEST', yes_bid: 30, yes_ask: null, price: 31 },
    });
    expect(mapWsTicker(msg).mark).toBeCloseTo(0.31, 10);
  });
});

describe('mapRestMarket', () => {
  it('normalizes a REST market row', () => {
    const t = mapRestMarket({ ticker: 'KXR', yes_bid: 40, yes_ask: 44, last_price: 42 });
    expect(t.mark).toBeCloseTo(0.42, 10);
  });
});
