import type { Axis } from './math.js';

/**
 * Quarter turns about the positive axis, counterclockwise by the right-hand rule.
 * `2` is a half turn (direction does not matter), `-1` is a single clockwise quarter turn.
 */
export type Turns = 1 | 2 | -1;

/**
 * A turn of the contiguous block of layers `from..to` (inclusive) along `axis`.
 * Layers are numbered 0..n-1 from the negative side (L, D, B) to the positive side (R, U, F).
 * Turning every layer is a whole-cube rotation (x, y, z).
 */
export interface Move {
  readonly axis: Axis;
  readonly from: number;
  readonly to: number;
  readonly turns: Turns;
}

/** Normalizes any integer number of quarter turns; returns 0 when it is a no-op. */
export function normalizeTurns(quarterTurns: number): Turns | 0 {
  const t = ((quarterTurns % 4) + 4) % 4;
  return t === 0 ? 0 : t === 1 ? 1 : t === 2 ? 2 : -1;
}

export function invertMove(move: Move): Move {
  return { ...move, turns: move.turns === 2 ? 2 : (-move.turns as Turns) };
}

/** The sequence that undoes `moves`. */
export function invertMoves(moves: readonly Move[]): Move[] {
  return moves.map(invertMove).reverse();
}

export function isCubeRotation(move: Move, n: number): boolean {
  return move.from === 0 && move.to === n - 1;
}

export function movesEqual(a: Move, b: Move): boolean {
  return a.axis === b.axis && a.from === b.from && a.to === b.to && a.turns === b.turns;
}

export function assertValidMove(move: Move, n: number): void {
  const { from, to } = move;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > n - 1 || from > to) {
    throw new RangeError(`Invalid layer range ${from}..${to} for a ${n}x${n} cube`);
  }
  if (move.turns !== 1 && move.turns !== 2 && move.turns !== -1) {
    throw new RangeError(`Invalid turns value ${String(move.turns)}`);
  }
}
