import type { Axis } from './math.js';
import { assertValidMove, normalizeTurns, type Move, type Turns } from './move.js';

export class NotationError extends Error {
  constructor(
    readonly token: string,
    reason: string,
  ) {
    super(`Invalid move "${token}": ${reason}`);
    this.name = 'NotationError';
  }
}

interface FaceSpec {
  axis: Axis;
  /** Which end of the axis the face sits on. */
  side: 1 | -1;
  /** Multiplier from notation direction (clockwise = 1) to Move.turns. */
  sign: 1 | -1;
}

// A clockwise turn of a face, seen from outside it, is a negative rotation about its outward normal.
const FACE_SPECS: Readonly<Record<string, FaceSpec>> = {
  R: { axis: 'x', side: 1, sign: -1 },
  L: { axis: 'x', side: -1, sign: 1 },
  U: { axis: 'y', side: 1, sign: -1 },
  D: { axis: 'y', side: -1, sign: 1 },
  F: { axis: 'z', side: 1, sign: -1 },
  B: { axis: 'z', side: -1, sign: 1 },
};

/** Middle slices follow L, D and F respectively. */
const SLICE_SPECS: Readonly<Record<string, { axis: Axis; sign: 1 | -1 }>> = {
  M: { axis: 'x', sign: 1 },
  E: { axis: 'y', sign: 1 },
  S: { axis: 'z', sign: -1 },
};

/** Whole-cube rotations follow R, U and F respectively. */
const ROTATION_SPECS: Readonly<Record<string, { axis: Axis; sign: 1 | -1 }>> = {
  x: { axis: 'x', sign: -1 },
  y: { axis: 'y', sign: -1 },
  z: { axis: 'z', sign: -1 },
};

const POSITIVE_FACE: Readonly<Record<Axis, string>> = { x: 'R', y: 'U', z: 'F' };
const NEGATIVE_FACE: Readonly<Record<Axis, string>> = { x: 'L', y: 'D', z: 'B' };
const SLICE_FOR_AXIS: Readonly<Record<Axis, string>> = { x: 'M', y: 'E', z: 'S' };

const TOKEN = /^(\d+)?([URFDLB]w|[URFDLBMESxyzurfdlb])(2'?|'?)$/;

function toTurns(sign: 1 | -1, amount: number): Turns {
  const turns = normalizeTurns(sign * amount);
  if (turns === 0) throw new Error('unreachable: amount is never a multiple of 4');
  return turns;
}

/** Parses one move in WCA notation, e.g. `R`, `U'`, `F2`, `Rw`, `r`, `3Rw'`, `2L`, `M`, `x2`. */
export function parseMove(token: string, n = 3): Move {
  const match = TOKEN.exec(token.replace(/[’′`]/g, "'"));
  if (!match) throw new NotationError(token, 'unrecognized notation');
  const [, prefix, rawBase, suffix] = match as unknown as [
    string,
    string | undefined,
    string,
    string,
  ];
  const amount = suffix.startsWith('2') ? 2 : suffix === "'" ? -1 : 1;

  const sliceSpec = SLICE_SPECS[rawBase] ?? ROTATION_SPECS[rawBase];
  if (sliceSpec) {
    if (prefix !== undefined) throw new NotationError(token, 'slices and rotations take no prefix');
    let from = 0;
    let to = n - 1;
    if (SLICE_SPECS[rawBase]) {
      if (n % 2 === 0) throw new NotationError(token, `no middle slice on an even cube`);
      from = to = (n - 1) / 2;
    }
    return { axis: sliceSpec.axis, from, to, turns: toTurns(sliceSpec.sign, amount) };
  }

  const lowercaseWide = rawBase.length === 1 && rawBase === rawBase.toLowerCase();
  if (lowercaseWide && prefix !== undefined) {
    throw new NotationError(token, 'lowercase wide moves take no prefix');
  }
  const wide = lowercaseWide || rawBase.endsWith('w');
  const spec = FACE_SPECS[rawBase[0]!.toUpperCase()]!;
  const depth = prefix !== undefined ? Number(prefix) : wide ? 2 : 1;
  if (depth < 1 || depth > n)
    throw new NotationError(token, `layer ${depth} does not exist on a ${n}x${n}`);

  // Layers counted inward from the face: the whole block for wide moves, a single layer otherwise.
  const inner = spec.side === 1 ? n - depth : depth - 1;
  const outer = spec.side === 1 ? n - 1 : 0;
  const [from, to] = wide ? [Math.min(inner, outer), Math.max(inner, outer)] : [inner, inner];
  return { axis: spec.axis, from, to, turns: toTurns(spec.sign, amount) };
}

/** Parses a whitespace-separated move sequence. */
export function parseMoves(sequence: string, n = 3): Move[] {
  return sequence
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => parseMove(t, n));
}

function suffixFor(sign: 1 | -1, turns: Turns): string {
  if (turns === 2) return '2';
  return sign * turns === 1 ? '' : "'";
}

/** Formats a move in canonical WCA notation. Inverse of {@link parseMove} for canonical tokens. */
export function formatMove(move: Move, n = 3): string {
  assertValidMove(move, n);
  const { axis, from, to, turns } = move;

  if (from === 0 && to === n - 1) return axis + suffixFor(ROTATION_SPECS[axis]!.sign, turns);

  if (from === to && n % 2 === 1 && from === (n - 1) / 2) {
    const slice = SLICE_FOR_AXIS[axis];
    return slice + suffixFor(SLICE_SPECS[slice]!.sign, turns);
  }

  let face: string;
  let depth: number;
  let wide: boolean;
  if (to === n - 1 || from === 0) {
    // Block touching a face: a face turn or a wide move.
    face = to === n - 1 ? POSITIVE_FACE[axis] : NEGATIVE_FACE[axis];
    depth = to - from + 1;
    wide = depth > 1;
  } else if (from === to) {
    // Single inner layer: count it from the nearer face.
    const fromPositive = n - from;
    const fromNegative = from + 1;
    face = fromPositive <= fromNegative ? POSITIVE_FACE[axis] : NEGATIVE_FACE[axis];
    depth = Math.min(fromPositive, fromNegative);
    wide = false;
  } else {
    throw new RangeError(`Layers ${from}..${to} cannot be written in standard notation`);
  }

  const prefix = wide ? (depth === 2 ? '' : String(depth)) : depth === 1 ? '' : String(depth);
  return prefix + face + (wide ? 'w' : '') + suffixFor(FACE_SPECS[face]!.sign, turns);
}

export function formatMoves(moves: readonly Move[], n = 3): string {
  return moves.map((m) => formatMove(m, n)).join(' ');
}
