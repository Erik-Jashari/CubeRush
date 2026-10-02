import { describe, expect, it } from 'vitest';
import { invertMoves } from './move.js';
import { parseMoves } from './notation.js';
import { generateScramble } from './scramble.js';
import { countMoves, verifySolve } from './verify.js';

const SEED = 'daily-2026-10-02';

describe('verifySolve', () => {
  it('accepts a move list that solves the seeded scramble', () => {
    const solution = invertMoves(generateScramble(SEED));
    expect(verifySolve(SEED, solution)).toEqual({ solved: true, moveCount: 25 });
  });

  it('rejects a move list that leaves the cube unsolved', () => {
    const solution = invertMoves(generateScramble(SEED)).slice(0, -1);
    expect(verifySolve(SEED, solution).solved).toBe(false);
    expect(verifySolve(SEED, []).solved).toBe(false);
  });

  it('rejects a solution for a different seed', () => {
    const solution = invertMoves(generateScramble('some-other-seed'));
    expect(verifySolve(SEED, solution).solved).toBe(false);
  });

  it('accepts solves that end in a different orientation, without counting rotations', () => {
    const solution = [...invertMoves(generateScramble(SEED)), ...parseMoves('x y2')];
    expect(verifySolve(SEED, solution)).toEqual({ solved: true, moveCount: 25 });
  });

  it('works for other cube sizes', () => {
    const solution = invertMoves(generateScramble(SEED, { n: 4 }));
    expect(verifySolve(SEED, solution, { n: 4 }).solved).toBe(true);
  });
});

describe('countMoves', () => {
  it('counts layer turns but not rotations', () => {
    expect(countMoves(parseMoves("R U x M2 y' Rw"))).toBe(4);
  });
});
