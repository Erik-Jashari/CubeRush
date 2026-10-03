import { describe, expect, it } from 'vitest';
import { applyMoves, createSolvedCube, isSolved, type CubeState } from './cube.js';
import { nextHint } from './hint.js';
import { parseMoves } from './notation.js';
import { practiceCube } from './practice.js';
import { generateScramble } from './scramble.js';
import { stageReached } from './stages.js';

/** Follows hints until solved; returns how many it took and the longest one. */
function followHints(start: CubeState) {
  let cube = start;
  let hints = 0;
  let longest = 0;
  for (; hints < 80 && !isSolved(cube); hints++) {
    const hint = nextHint(cube);
    if (!hint) throw new Error(`no hint at stage ${stageReached(cube)}`);
    const before = stageReached(cube);
    cube = applyMoves(cube, hint.moves);
    expect(stageReached(cube)).toBeGreaterThanOrEqual(before);
    if (hint.stage < 7) longest = Math.max(longest, hint.moves.length);
  }
  return { solved: isSolved(cube), hints, longest };
}

describe('hints', () => {
  it('solve a full scramble held the beginner way, in short steps', () => {
    for (let i = 0; i < 40; i++) {
      const { state } = practiceCube(1, `hint-${i}`);
      const run = followHints(state);
      expect(run.solved).toBe(true);
      // 4 cross edges, 4 corners, 4 middle edges and a handful of last-layer steps.
      expect(run.hints).toBeLessThanOrEqual(30);
      // The longest non-final hint is a few algorithms, not a whole solution.
      expect(run.longest).toBeLessThanOrEqual(32);
    }
  }, 60_000);

  it('work however the cube is held', () => {
    for (const hold of ['', 'x', "z'", 'y2', 'x2 y']) {
      const scrambled = applyMoves(createSolvedCube(3), [
        ...parseMoves(hold),
        ...generateScramble(`any-way-${hold}`),
      ]);
      expect(followHints(scrambled).solved).toBe(true);
    }
  });

  it('say which piece the moves are for', () => {
    const hint = nextHint(practiceCube(1, 'words').state)!;
    expect(hint.stage).toBe(1);
    expect(hint.text).toMatch(/^Bring the white–(red|orange|green|blue) edge/);
    const corner = nextHint(practiceCube(2, 'words').state)!;
    expect(corner.text).toMatch(/^Put the white–\w+–\w+ corner in: /);
  });

  it('are null once solved', () => {
    expect(nextHint(createSolvedCube(3))).toBeNull();
  });

  it('are quick to work out', () => {
    const cubes = Array.from({ length: 20 }, (_, i) => practiceCube(1, `speed-${i}`).state);
    const started = performance.now();
    for (const cube of cubes) nextHint(cube);
    // Generous for slow CI machines; typically a few milliseconds each.
    expect((performance.now() - started) / cubes.length).toBeLessThan(250);
  });
});
