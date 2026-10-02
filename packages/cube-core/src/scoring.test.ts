import { describe, expect, it } from 'vitest';
import { computePoints } from './scoring.js';

const BASE = { timeMs: 30_000, moveCount: 60, usedUndo: false };

describe('computePoints', () => {
  it('computes a known breakdown', () => {
    expect(computePoints(BASE)).toEqual({
      time: 500,
      moves: 100,
      noUndo: 100,
      waves: 0,
      streakMultiplier: 1,
      modeMultiplier: 1,
      total: 700,
    });
  });

  it('rewards faster solves', () => {
    expect(computePoints({ ...BASE, timeMs: 20_000 }).total).toBeGreaterThan(
      computePoints(BASE).total,
    );
  });

  it('rewards fewer moves, with no penalty past par', () => {
    expect(computePoints({ ...BASE, moveCount: 50 }).moves).toBe(150);
    expect(computePoints({ ...BASE, moveCount: 200 }).moves).toBe(0);
  });

  it('drops the no-undo bonus when undo was used', () => {
    expect(computePoints({ ...BASE, usedUndo: true }).total).toBe(600);
  });

  it('applies streak (capped) and mode multipliers', () => {
    expect(computePoints({ ...BASE, streak: 4 }).total).toBe(840);
    expect(computePoints({ ...BASE, streak: 50 }).streakMultiplier).toBe(1.5);
    expect(computePoints({ ...BASE, modeMultiplier: 2 }).total).toBe(1400);
  });

  it('never goes negative for very slow solves', () => {
    expect(
      computePoints({ ...BASE, timeMs: 3_600_000, moveCount: 400, usedUndo: true }).total,
    ).toBeGreaterThan(0);
  });

  it('rejects invalid input', () => {
    expect(() => computePoints({ ...BASE, timeMs: -1 })).toThrow(RangeError);
    expect(() => computePoints({ ...BASE, timeMs: NaN })).toThrow(RangeError);
    expect(() => computePoints({ ...BASE, moveCount: 1.5 })).toThrow(RangeError);
    expect(() => computePoints({ ...BASE, modeMultiplier: 0 })).toThrow(RangeError);
  });
});
