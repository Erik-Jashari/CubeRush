import {
  AXIS_INDEX,
  IDENTITY,
  mulMatMat,
  mulMatVec,
  rotationMatrix,
  vecEquals,
  type Mat3,
  type Vec3,
} from './math.js';
import { assertValidMove, type Move } from './move.js';

export type Face = 'U' | 'D' | 'R' | 'L' | 'F' | 'B';

export const FACES: readonly Face[] = ['U', 'D', 'R', 'L', 'F', 'B'];

/** Outward normal of each face. Sticker "colors" are the face they start on. */
export const FACE_NORMALS: Readonly<Record<Face, Vec3>> = {
  R: [1, 0, 0],
  L: [-1, 0, 0],
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

/**
 * One visible piece. Positions use doubled coordinates so they stay integers for every size:
 * along each axis a piece sits at 2·layer − (n − 1), e.g. −2, 0, 2 on a 3x3.
 */
export interface Cubie {
  readonly id: number;
  /** Position in the solved cube; also identifies which stickers the piece carries. */
  readonly home: Vec3;
  readonly pos: Vec3;
  /** Rotation from the solved orientation to the current one. */
  readonly rot: Mat3;
}

export interface CubeState {
  readonly n: number;
  /** Always ordered by `id`. */
  readonly cubies: readonly Cubie[];
}

export interface Sticker {
  readonly cubieId: number;
  /** The face this sticker belongs to when solved (its color). */
  readonly color: Face;
  /** Current position of the sticker's cubie. */
  readonly pos: Vec3;
  /** Current outward normal. */
  readonly normal: Vec3;
}

export function layerToCoord(n: number, layer: number): number {
  return 2 * layer - (n - 1);
}

export function coordToLayer(n: number, coord: number): number {
  return (coord + n - 1) / 2;
}

export function createSolvedCube(n = 3): CubeState {
  if (!Number.isInteger(n) || n < 2) throw new RangeError(`Cube size must be an integer >= 2`);
  const max = n - 1;
  const cubies: Cubie[] = [];
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      for (let z = 0; z < n; z++) {
        const onSurface = [x, y, z].some((l) => l === 0 || l === max);
        if (!onSurface) continue;
        const home: Vec3 = [layerToCoord(n, x), layerToCoord(n, y), layerToCoord(n, z)];
        cubies.push({ id: cubies.length, home, pos: home, rot: IDENTITY });
      }
    }
  }
  return { n, cubies };
}

export function applyMove(state: CubeState, move: Move): CubeState {
  const { n } = state;
  assertValidMove(move, n);
  const axis = AXIS_INDEX[move.axis];
  const lo = layerToCoord(n, move.from);
  const hi = layerToCoord(n, move.to);
  const r = rotationMatrix(move.axis, move.turns);
  const cubies = state.cubies.map((c) => {
    const coord = c.pos[axis];
    if (coord < lo || coord > hi) return c;
    return { ...c, pos: mulMatVec(r, c.pos), rot: mulMatMat(r, c.rot) };
  });
  return { n, cubies };
}

export function applyMoves(state: CubeState, moves: readonly Move[]): CubeState {
  return moves.reduce(applyMove, state);
}

/** Faces a piece carries stickers for, based on where it sits in the solved cube. */
export function cubieColors(n: number, cubie: Pick<Cubie, 'home'>): Face[] {
  const max = n - 1;
  return FACES.filter((face) => {
    const normal = FACE_NORMALS[face];
    const axis = normal.findIndex((v) => v !== 0);
    return cubie.home[axis] === normal[axis]! * max;
  });
}

export function getStickers(state: CubeState): Sticker[] {
  const stickers: Sticker[] = [];
  for (const cubie of state.cubies) {
    for (const color of cubieColors(state.n, cubie)) {
      stickers.push({
        cubieId: cubie.id,
        color,
        pos: cubie.pos,
        normal: mulMatVec(cubie.rot, FACE_NORMALS[color]),
      });
    }
  }
  return stickers;
}

export function normalToFace(normal: Vec3): Face {
  for (const face of FACES) {
    if (vecEquals(FACE_NORMALS[face], normal)) return face;
  }
  throw new Error(`Not a face normal: ${normal.join(',')}`);
}

/**
 * True when every face shows a single color. Center orientation is ignored and the cube may be
 * in any whole-cube orientation, so a solve finished after x/y/z rotations still counts.
 */
export function isSolved(state: CubeState): boolean {
  const colorOnFace = new Map<Face, Face>();
  for (const sticker of getStickers(state)) {
    const face = normalToFace(sticker.normal);
    const seen = colorOnFace.get(face);
    if (seen === undefined) colorOnFace.set(face, sticker.color);
    else if (seen !== sticker.color) return false;
  }
  return true;
}

export function statesEqual(a: CubeState, b: CubeState): boolean {
  if (a.n !== b.n || a.cubies.length !== b.cubies.length) return false;
  return a.cubies.every((c, i) => {
    const d = b.cubies[i]!;
    return (
      c.id === d.id &&
      c.pos.every((v, k) => v === d.pos[k]) &&
      c.rot.every((v, k) => v === d.rot[k])
    );
  });
}
