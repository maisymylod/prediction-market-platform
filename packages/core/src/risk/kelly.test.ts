import { describe, it, expect } from 'vitest';
import { halfKelly } from './kelly.js';

describe('halfKelly (reference sizing only)', () => {
  it('positive edge sizes the YES side', () => {
    const r = halfKelly(0.6, 0.5);
    expect(r.side).toBe('yes');
    expect(r.edge).toBeCloseTo(0.1, 10);
    expect(r.fullKelly).toBeCloseTo(0.2, 10); // (0.6-0.5)/(1-0.5)
    expect(r.halfKelly).toBeCloseTo(0.1, 10);
  });

  it('negative edge sizes the NO side symmetrically', () => {
    const r = halfKelly(0.4, 0.5);
    expect(r.side).toBe('no');
    // NO estimate 0.6, NO price 0.5 -> (0.6-0.5)/(1-0.5) = 0.2
    expect(r.fullKelly).toBeCloseTo(0.2, 10);
    expect(r.halfKelly).toBeCloseTo(0.1, 10);
  });

  it('no edge yields zero size', () => {
    const r = halfKelly(0.5, 0.5);
    expect(r.side).toBe('none');
    expect(r.halfKelly).toBe(0);
  });

  it('larger edge, lower price', () => {
    const r = halfKelly(0.7, 0.2);
    expect(r.fullKelly).toBeCloseTo(0.625, 10); // 0.5/0.8
    expect(r.halfKelly).toBeCloseTo(0.3125, 10);
  });

  it('degenerate prices return no size', () => {
    expect(halfKelly(0.9, 0).side).toBe('none');
    expect(halfKelly(0.9, 1).side).toBe('none');
    expect(halfKelly(0.9, 0).halfKelly).toBe(0);
  });

  it('always carries a not-advice note', () => {
    expect(halfKelly(0.6, 0.5).note).toMatch(/not financial advice/i);
  });
});
