import { describe, expect, it } from 'vitest';
import {
  applyMove,
  applyMoves,
  createSolvedCube,
  FACE_NORMALS,
  getStickers,
  isSolved,
  statesEqual,
  type CubeState,
  type Face,
} from './cube.js';
import { parseMove, parseMoves } from './notation.js';

const SEXY = "R U R' U'";

function repeat(sequence: string, times: number): string {
  return Array.from({ length: times }, () => sequence).join(' ');
}

function run(sequence: string, n = 3): CubeState {
  return applyMoves(createSolvedCube(n), parseMoves(sequence, n));
}

/** Colors of the stickers currently facing `face`, filtered by a position predicate. */
function colorsOn(
  state: CubeState,
  face: Face,
  where: (pos: readonly number[]) => boolean,
): Face[] {
  const normal = FACE_NORMALS[face];
  return getStickers(state)
    .filter((s) => s.normal.every((v, i) => v === normal[i]) && where(s.pos))
    .map((s) => s.color);
}

describe('createSolvedCube', () => {
  it('builds only the visible pieces', () => {
    expect(createSolvedCube(2).cubies).toHaveLength(8);
    expect(createSolvedCube(3).cubies).toHaveLength(26);
    expect(createSolvedCube(4).cubies).toHaveLength(56);
  });

  it('has 6·n² stickers', () => {
    for (const n of [2, 3, 4, 5]) expect(getStickers(createSolvedCube(n))).toHaveLength(6 * n * n);
  });

  it('starts solved', () => {
    for (const n of [2, 3, 4, 5]) expect(isSolved(createSolvedCube(n))).toBe(true);
  });

  it('rejects invalid sizes', () => {
    expect(() => createSolvedCube(1)).toThrow(RangeError);
    expect(() => createSolvedCube(2.5)).toThrow(RangeError);
  });
});

describe('applyMove', () => {
  it('does not mutate the input state', () => {
    const solved = createSolvedCube();
    const before = JSON.stringify(solved);
    applyMove(solved, parseMove('R'));
    expect(JSON.stringify(solved)).toBe(before);
  });

  it('a single turn unsolves the cube', () => {
    expect(isSolved(run('R'))).toBe(false);
    expect(isSolved(run('M'))).toBe(false);
  });

  it('four quarter turns of any layer return to solved', () => {
    for (const token of ['R', 'L', 'U', 'D', 'F', 'B', 'M', 'E', 'S', 'Rw', "U'"]) {
      expect(statesEqual(run(repeat(token, 4)), createSolvedCube())).toBe(true);
    }
  });

  it('a half turn twice returns to solved', () => {
    expect(statesEqual(run('F2 F2'), createSolvedCube())).toBe(true);
  });

  it("(R U R' U') x6 returns to solved", () => {
    for (const n of [2, 3, 4, 5]) {
      expect(statesEqual(run(repeat(SEXY, 6), n), createSolvedCube(n))).toBe(true);
    }
    expect(isSolved(run(repeat(SEXY, 5)))).toBe(false);
  });

  it('a whole-cube rotation keeps the cube solved', () => {
    expect(isSolved(run("x y2 z'"))).toBe(true);
  });

  it('rejects layers outside the cube', () => {
    expect(() => applyMove(createSolvedCube(), { axis: 'x', from: 0, to: 3, turns: 1 })).toThrow(
      RangeError,
    );
  });
});

describe('turn directions follow WCA conventions', () => {
  it('R moves the front right column up to U', () => {
    expect(colorsOn(run('R'), 'U', (p) => p[0] === 2)).toEqual(['F', 'F', 'F']);
  });

  it('U moves the right face top row onto F', () => {
    expect(colorsOn(run('U'), 'F', (p) => p[1] === 2)).toEqual(['R', 'R', 'R']);
  });

  it('F moves the bottom U row onto R', () => {
    expect(colorsOn(run('F'), 'R', (p) => p[2] === 2)).toEqual(['U', 'U', 'U']);
  });

  it('L moves the U left column onto F', () => {
    expect(colorsOn(run('L'), 'F', (p) => p[0] === -2)).toEqual(['U', 'U', 'U']);
  });

  it("slices match their outer-layer equivalents: M = R L' x', E = U D' y', S = F' B z", () => {
    expect(statesEqual(run('M'), run("R L' x'"))).toBe(true);
    expect(statesEqual(run('E'), run("U D' y'"))).toBe(true);
    expect(statesEqual(run('S'), run("F' B z"))).toBe(true);
  });

  it('wide moves equal the face turn plus the next layer', () => {
    expect(statesEqual(run('Rw'), run("R M'"))).toBe(true);
    expect(statesEqual(run('r'), run('Rw'))).toBe(true);
  });
});
