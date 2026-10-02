import { applyMoves, createSolvedCube, type CubeState } from './cube.js';
import type { Move } from './move.js';
import { parseMove } from './notation.js';
import { createRng } from './rng.js';

export interface ScrambleOptions {
  /** Cube size, default 3. */
  n?: number;
  /** Number of moves, default depends on the size (25 on a 3x3). */
  length?: number;
}

export function defaultScrambleLength(n: number): number {
  if (n <= 2) return 11;
  if (n === 3) return 25;
  return 20 * (n - 2);
}

const FACE_AXIS: Readonly<Record<string, string>> = {
  R: 'x',
  L: 'x',
  U: 'y',
  D: 'y',
  F: 'z',
  B: 'z',
};
const SUFFIXES = ['', "'", '2'] as const;

/**
 * Seeded random-move scramble. Never turns the same face twice in a row, and never makes three
 * consecutive turns on one axis (e.g. `R L R`), so no moves cancel out.
 */
export function generateScramble(seed: string, options: ScrambleOptions = {}): Move[] {
  const n = options.n ?? 3;
  const length = options.length ?? defaultScrambleLength(n);
  if (!Number.isInteger(length) || length < 0) throw new RangeError('Scramble length must be >= 0');

  const rng = createRng(`scramble:${n}:${seed}`);
  // On a 2x2, L/D/B turns are just R/U/F plus a rotation, so only R/U/F are used.
  const faces = n === 2 ? ['R', 'U', 'F'] : ['R', 'L', 'U', 'D', 'F', 'B'];
  // Bigger cubes also need wide turns to scramble the inner layers.
  const maxDepth = n >= 4 ? Math.floor(n / 2) : 1;

  const moves: Move[] = [];
  const history: string[] = [];
  while (moves.length < length) {
    const face = rng.pick(faces);
    const prev = history[history.length - 1];
    const prevPrev = history[history.length - 2];
    if (face === prev) continue;
    if (
      prev !== undefined &&
      prevPrev !== undefined &&
      FACE_AXIS[face] === FACE_AXIS[prev] &&
      FACE_AXIS[face] === FACE_AXIS[prevPrev]
    ) {
      continue;
    }
    const depth = 1 + rng.int(maxDepth);
    const base = depth === 1 ? face : depth === 2 ? `${face}w` : `${depth}${face}w`;
    moves.push(parseMove(base + rng.pick(SUFFIXES), n));
    history.push(face);
  }
  return moves;
}

export interface ScrambledCube {
  scramble: Move[];
  state: CubeState;
}

export function createScrambledCube(seed: string, options: ScrambleOptions = {}): ScrambledCube {
  const scramble = generateScramble(seed, options);
  return { scramble, state: applyMoves(createSolvedCube(options.n ?? 3), scramble) };
}
