import { applyMoves, isSolved } from './cube.js';
import { isCubeRotation, type Move } from './move.js';
import { createScrambledCube, type ScrambleOptions } from './scramble.js';

export interface VerifyResult {
  solved: boolean;
  /** Turns made by the player, not counting whole-cube rotations. */
  moveCount: number;
}

/** Number of layer turns in `moves`; whole-cube rotations are free. */
export function countMoves(moves: readonly Move[], n = 3): number {
  return moves.filter((m) => !isCubeRotation(m, n)).length;
}

/**
 * Replays `moves` on the scramble generated from `seed` and reports whether the cube ends solved.
 * The server uses this so it never has to trust a client's claim that a solve happened.
 */
export function verifySolve(
  seed: string,
  moves: readonly Move[],
  options: ScrambleOptions = {},
): VerifyResult {
  const n = options.n ?? 3;
  const { state } = createScrambledCube(seed, options);
  return { solved: isSolved(applyMoves(state, moves)), moveCount: countMoves(moves, n) };
}
