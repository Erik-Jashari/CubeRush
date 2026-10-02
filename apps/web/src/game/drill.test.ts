import { formatMove, parseMove } from '@cuberush/cube-core';
import { describe, expect, it } from 'vitest';
import { drillDone, drillHint, drillStep, startDrill, type Drill } from './drill';

function play(drill: Drill, notation: string): Drill {
  return notation.split(' ').reduce((d, m) => drillStep(d, parseMove(m)), drill);
}
const hint = (d: Drill) => {
  const m = drillHint(d);
  return m && formatMove(m);
};

describe('drill', () => {
  it('advances on the expected moves and finishes', () => {
    const d = play(startDrill("R U R' U'"), "R U R' U'");
    expect(drillDone(d)).toBe(true);
    expect(drillHint(d)).toBeNull();
  });

  it('a wrong turn must be undone before continuing', () => {
    let d = play(startDrill('R U'), 'R L');
    expect(d.index).toBe(1);
    expect(hint(d)).toBe("L'");
    d = play(d, 'U'); // still off script: now U' then L' are needed
    expect(hint(d)).toBe("U'");
    d = play(d, "U' L' U");
    expect(drillDone(d)).toBe(true);
  });

  it('accepts a half turn as two quarter turns either way', () => {
    expect(drillDone(play(startDrill('R2 U'), 'R R U'))).toBe(true);
    expect(drillDone(play(startDrill('R2'), "R' R'"))).toBe(true);
  });

  it('points at the second quarter of a half turn', () => {
    const d = play(startDrill('F2'), 'F');
    expect(d.half).not.toBeNull();
    expect(hint(d)).toBe('F');
  });

  it('a quarter turn undone before finishing the half turn resets it', () => {
    const d = play(startDrill('R2'), "R R'");
    expect(d).toMatchObject({ index: 0, half: null, wrong: [] });
    expect(hint(d)).toBe('R2');
  });
});
