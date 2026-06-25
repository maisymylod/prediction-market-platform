import { describe, it, expect } from 'vitest';
import { backoffDelay } from './backoff.js';

describe('backoffDelay (full jitter, capped)', () => {
  it('returns 0 with rng=0', () => {
    expect(backoffDelay(0, { baseMs: 500, rng: () => 0 })).toBe(0);
  });
  it('scales the ceiling exponentially by attempt', () => {
    const rng = () => 0.999999;
    // attempt 0 ceiling = 500
    expect(backoffDelay(0, { baseMs: 500, factor: 2, rng })).toBe(499);
    // attempt 2 ceiling = 500 * 2^2 = 2000
    expect(backoffDelay(2, { baseMs: 500, factor: 2, rng })).toBe(1999);
  });
  it('caps at maxMs', () => {
    const rng = () => 0.999999;
    expect(backoffDelay(20, { baseMs: 500, factor: 2, maxMs: 3000, rng })).toBe(2999);
  });
  it('produces a value within [0, ceiling)', () => {
    for (let i = 0; i < 50; i++) {
      const d = backoffDelay(3, { baseMs: 100, factor: 2, maxMs: 10_000 });
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(800); // 100 * 2^3
    }
  });
});
