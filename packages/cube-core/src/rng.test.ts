import { describe, expect, it } from 'vitest';
import { createRng, hashString } from './rng.js';

function sample(seed: string | number, count = 20): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
}

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    expect(sample('daily-2026-10-02')).toEqual(sample('daily-2026-10-02'));
    expect(sample(42)).toEqual(sample(42));
  });

  it('differs between seeds', () => {
    expect(sample('daily-2026-10-02')).not.toEqual(sample('daily-2026-10-03'));
  });

  it('stays within range', () => {
    const rng = createRng('range');
    for (let i = 0; i < 1000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const k = rng.int(6);
      expect(Number.isInteger(k) && k >= 0 && k < 6).toBe(true);
    }
  });

  it('covers every value of a small range', () => {
    const rng = createRng('coverage');
    const seen = new Set(Array.from({ length: 200 }, () => rng.int(6)));
    expect(seen.size).toBe(6);
  });

  it('rejects bad arguments', () => {
    const rng = createRng('x');
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});

describe('hashString', () => {
  it('is stable across runs', () => {
    expect(hashString('cuberush')).toBe(hashString('cuberush'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});
