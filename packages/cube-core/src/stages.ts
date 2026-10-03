import { cubieColors, FACE_NORMALS, type CubeState, type Cubie, type Face } from './cube.js';
import { mulMatVec, vecEquals, type Vec3 } from './math.js';

/**
 * Progress through the beginner layer-by-layer method. White is the U color and yellow the D
 * color of a solved cube, but every check is relative to where the centers currently are, so it
 * works in any orientation (the method holds white on the bottom).
 */
export const STAGES = [
  'White cross',
  'White corners',
  'Middle edges',
  'Yellow cross',
  'Yellow edges',
  'Yellow corners placed',
  'Yellow corners turned',
] as const;

/** Stage n (1..7) is done when STAGES[n - 1] is complete; 7 means solved. */
export type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const WHITE: Face = 'U';
const YELLOW: Face = 'D';

interface Piece {
  cubie: Cubie;
  colors: Face[];
  /** Current outward normal of each colored sticker. */
  normals: Map<Face, Vec3>;
}

function pieces(state: CubeState): Piece[] {
  if (state.n !== 3) throw new RangeError('Stages are defined for a 3x3 cube');
  return state.cubies.map((cubie) => {
    const colors = cubieColors(3, cubie);
    return {
      cubie,
      colors,
      normals: new Map(colors.map((c) => [c, mulMatVec(cubie.rot, FACE_NORMALS[c])])),
    };
  });
}

/** Which way each color's center faces right now. */
function centerNormals(all: readonly Piece[]): Map<Face, Vec3> {
  const centers = new Map<Face, Vec3>();
  for (const p of all)
    if (p.colors.length === 1) centers.set(p.colors[0]!, p.normals.get(p.colors[0]!)!);
  return centers;
}

export interface StageProgress {
  /** Last stage completed, as `stageReached` returns it. */
  stage: Stage | 0;
  /** Colors of each piece of the next stage that is already done; empty once solved. */
  done: Face[][];
  /** Colors of each piece of the next stage still to do; empty once solved. */
  todo: Face[][];
}

export function stageReached(state: CubeState): Stage | 0 {
  return stageProgress(state).stage;
}

/** How far through the method the cube is, down to the pieces of the step being worked on. */
export function stageProgress(state: CubeState): StageProgress {
  const all = pieces(state);
  const centers = centerNormals(all);
  const solved = (p: Piece) => p.colors.every((c) => vecEquals(p.normals.get(c)!, centers.get(c)!));
  /** In its home slot, however it's twisted: its position is where its colors' centers point. */
  const placed = (p: Piece) => {
    const home = p.colors.reduce<[number, number, number]>(
      (sum, c) => {
        const n = centers.get(c)!;
        return [sum[0] + 2 * n[0], sum[1] + 2 * n[1], sum[2] + 2 * n[2]];
      },
      [0, 0, 0],
    );
    return vecEquals(home, p.cubie.pos);
  };

  const edges = all.filter((p) => p.colors.length === 2);
  const corners = all.filter((p) => p.colors.length === 3);
  const has = (p: Piece, c: Face) => p.colors.includes(c);
  const whiteEdges = edges.filter((p) => has(p, WHITE));
  const whiteCorners = corners.filter((p) => has(p, WHITE));
  const middleEdges = edges.filter((p) => !has(p, WHITE) && !has(p, YELLOW));
  const yellowEdges = edges.filter((p) => has(p, YELLOW));
  const yellowCorners = corners.filter((p) => has(p, YELLOW));
  const yellowUp = centers.get(YELLOW)!;

  // Each stage: the pieces it is about and what "done" means for one of them. With stages 1–6
  // done, the yellow corners being solved means the whole cube is.
  const checks: [Piece[], (p: Piece) => boolean][] = [
    [whiteEdges, solved],
    [whiteCorners, solved],
    [middleEdges, solved],
    [yellowEdges, (p) => vecEquals(p.normals.get(YELLOW)!, yellowUp)],
    [yellowEdges, solved],
    [yellowCorners, placed],
    [yellowCorners, solved],
  ];
  for (let i = 0; i < checks.length; i++) {
    const [group, ok] = checks[i]!;
    const todo = group.filter((p) => !ok(p));
    if (todo.length > 0) {
      const done = group.filter(ok);
      return {
        stage: i as Stage | 0,
        done: done.map((p) => p.colors),
        todo: todo.map((p) => p.colors),
      };
    }
  }
  return { stage: 7, done: [], todo: [] };
}
