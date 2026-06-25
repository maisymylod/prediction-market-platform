import { describe, it, expect } from 'vitest';
import { shouldApplyUpdate, isStale, freshnessFor } from './freshness.js';

describe('shouldApplyUpdate (idempotency / ordering)', () => {
  it('applies when nothing is held', () => {
    expect(shouldApplyUpdate(1000, undefined)).toBe(true);
  });
  it('applies a strictly newer update', () => {
    expect(shouldApplyUpdate(1001, 1000)).toBe(true);
  });
  it('drops an equal timestamp (duplicate)', () => {
    expect(shouldApplyUpdate(1000, 1000)).toBe(false);
  });
  it('drops an out-of-order older update', () => {
    expect(shouldApplyUpdate(999, 1000)).toBe(false);
  });
});

describe('isStale', () => {
  it('treats never-seen as stale', () => {
    expect(isStale(null, 5000, 1000)).toBe(true);
  });
  it('is fresh within the threshold', () => {
    expect(isStale(4500, 5000, 1000)).toBe(false);
  });
  it('is stale past the threshold', () => {
    expect(isStale(3000, 5000, 1000)).toBe(true);
  });
});

describe('freshnessFor', () => {
  it('down when never seen', () => {
    expect(freshnessFor(null, 10_000, 1000)).toBe('down');
  });
  it('live within threshold', () => {
    expect(freshnessFor(9500, 10_000, 1000)).toBe('live');
  });
  it('stale past stale threshold', () => {
    expect(freshnessFor(8000, 10_000, 1000)).toBe('stale');
  });
  it('down past the hard cutoff', () => {
    expect(freshnessFor(1000, 10_000, 1000, 5000)).toBe('down');
  });
});
