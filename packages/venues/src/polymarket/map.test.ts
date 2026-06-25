import { describe, it, expect } from 'vitest';
import { parsePrice, quoteFrom } from './map.js';

describe('parsePrice', () => {
  it('parses decimal strings', () => {
    expect(parsePrice('0.52')).toBeCloseTo(0.52, 10);
    expect(parsePrice(0.4)).toBeCloseTo(0.4, 10);
  });
  it('handles null and non-numeric', () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice('not-a-number')).toBeNull();
  });
  it('clamps to [0,1]', () => {
    expect(parsePrice('1.5')).toBe(1);
    expect(parsePrice('-0.2')).toBe(0);
  });
});

describe('quoteFrom', () => {
  it('mids buy/sell into a mark', () => {
    const q = quoteFrom(0.53, 0.49); // buy=ask, sell=bid
    expect(q.yesAsk).toBeCloseTo(0.53, 10);
    expect(q.yesBid).toBeCloseTo(0.49, 10);
    expect(q.mark).toBeCloseTo(0.51, 10);
  });
  it('falls back to whichever side exists', () => {
    expect(quoteFrom(0.5, null).mark).toBeCloseTo(0.5, 10);
    expect(quoteFrom(null, 0.4).mark).toBeCloseTo(0.4, 10);
    expect(quoteFrom(null, null).mark).toBeNull();
  });
});
