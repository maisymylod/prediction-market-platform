import { describe, it, expect } from 'vitest';
import { contractValue, contractPayoff } from './contracts.js';

describe('contractValue', () => {
  it('YES contract is worth the mark', () => {
    expect(contractValue('yes', 0.62)).toBeCloseTo(0.62, 10);
  });
  it('NO contract is worth 1 - mark', () => {
    expect(contractValue('no', 0.62)).toBeCloseTo(0.38, 10);
  });
  it('handles boundaries', () => {
    expect(contractValue('yes', 0)).toBe(0);
    expect(contractValue('no', 0)).toBe(1);
    expect(contractValue('yes', 1)).toBe(1);
    expect(contractValue('no', 1)).toBe(0);
  });
});

describe('contractPayoff', () => {
  it('YES pays 1 on YES, 0 on NO', () => {
    expect(contractPayoff('yes', true)).toBe(1);
    expect(contractPayoff('yes', false)).toBe(0);
  });
  it('NO pays 1 on NO, 0 on YES', () => {
    expect(contractPayoff('no', true)).toBe(0);
    expect(contractPayoff('no', false)).toBe(1);
  });
});
