import { ALGORITHMS } from './algorithms.js';
import {
  applyMove,
  applyMoves,
  createSolvedCube,
  cubieColors,
  FACE_NORMALS,
  FACES,
  type CubeState,
  type Cubie,
  type Face,
} from './cube.js';
import { AXES, mulMatVec, vecEquals, type Mat3, type Vec3 } from './math.js';
import { normalizeTurns, type Move } from './move.js';
import { formatMove, formatMoves, parseMoves } from './notation.js';
import { stageProgress, type Stage, type StageProgress } from './stages.js';

/** The next thing to do, in the beginner method's terms. */
export interface Hint {
  /** The method step being worked on (1–7). */
  stage: Stage;
  /** A sentence saying what the moves achieve. */
  text: string;
  /** The moves to make, for the cube as it is held right now. */
  moves: Move[];
}

/** Color names of the classic scheme, by the face each color starts on. */
const COLOR_NAMES: Readonly<Record<Face, string>> = {
  U: 'white',
  D: 'yellow',
  F: 'green',
  B: 'blue',
  R: 'red',
  L: 'orange',
};

/** E.g. "white–red–green": white or yellow first, as cubers say it. */
function pieceName(colors: readonly Face[]): string {
  const rank = (c: Face) => (c === 'U' || c === 'D' ? 0 : 1);
  return [...colors]
    .sort((a, b) => rank(a) - rank(b))
    .map((c) => COLOR_NAMES[c])
    .join('–');
}

// ---- Frames: everything is written for white on the bottom, then turned to match the cube ----

/** Which way the center of `face`'s color points now. */
function centerNormal(state: CubeState, face: Face): Vec3 {
  const home = FACE_NORMALS[face].map((v) => v * (state.n - 1)) as unknown as Vec3;
  const center = state.cubies.find((c) => vecEquals(c.home, home))!;
  return mulMatVec(center.rot, FACE_NORMALS[face]);
}

/** Rotation from a solved cube to where the centers point now (columns: R, U and F centers). */
function frameOf(state: CubeState): Mat3 {
  const [r, u, f] = [centerNormal(state, 'R'), centerNormal(state, 'U'), centerNormal(state, 'F')];
  return [r[0], u[0], f[0], r[1], u[1], f[1], r[2], u[2], f[2]];
}

function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

function mul(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out.push(a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!);
    }
  }
  return out as unknown as Mat3;
}

/** The same turn on a cube that has been rotated by `t`. */
function rotateMove(move: Move, t: Mat3, n: number): Move {
  const unit = AXES.map((a) => (a === move.axis ? 1 : 0)) as unknown as Vec3;
  const v = mulMatVec(t, unit);
  const index = v.findIndex((x) => x !== 0);
  const axis = AXES[index]!;
  if (v[index]! > 0) return { ...move, axis };
  // The axis now points the other way: layers count from the other side and the turn reverses.
  return {
    axis,
    from: n - 1 - move.to,
    to: n - 1 - move.from,
    turns: normalizeTurns(-move.turns) as Move['turns'],
  };
}

/** White on the bottom, as the method holds the cube. */
const HELD_FRAME = frameOf(applyMoves(createSolvedCube(3), parseMoves('z2')));

/** Rotation from the held frame to the cube's frame now. */
const heldToCube = (state: CubeState) => mul(frameOf(state), transpose(HELD_FRAME));

// ---- Stages 2–6: search over the method's own algorithms ----

interface Macro {
  moves: Move[];
  /** A named algorithm, said with the side it is done facing. */
  name?: string;
  /** Held-frame direction the player faces for it (+z is the front). */
  front?: Vec3;
  /** The sexy move done this many times in a row. */
  repeat?: number;
  /** A plain U-layer turn; two in a row are never needed. */
  turn?: boolean;
  /** Only ever the last step of a hint, so the search doesn't build on it. */
  last?: boolean;
}

const U_TURNS: Macro[] = ['U', "U'", 'U2'].map((m) => ({ moves: parseMoves(m), turn: true }));

/**
 * `notation` done facing each side of the cube in turn. The whole-cube rotation is folded into
 * the moves, so players never have to rotate the cube (dragging can't).
 */
function fromEachSide(notation: string, extra: Omit<Macro, 'moves' | 'front'>): Macro[] {
  const moves = parseMoves(notation);
  return ['', 'y', 'y2', "y'"].map((y) => {
    const t = frameOf(applyMoves(createSolvedCube(3), parseMoves(y)));
    return {
      ...extra,
      moves: moves.map((m) => rotateMove(m, t, 3)),
      front: mulMatVec(t, [0, 0, 1]),
    };
  });
}

const { sexy, rightInsert, leftInsert, yellowCross, edgeSwap, cornerCycle, cornerTwist } =
  ALGORITHMS;
const named = (alg: { name: string; notation: string }) =>
  fromEachSide(alg.notation, { name: alg.name.toLowerCase() });

type MacroStage = 2 | 3 | 4 | 5 | 6;
const SEARCH: Readonly<Record<MacroStage, { macros: Macro[]; depth: number; goal: string }>> = {
  // Repeating the sexy move at a slot drops the corner above it in; once lifts a stuck one out.
  // Repeating it is only ever how a corner goes in, never a setup.
  2: {
    macros: [
      ...U_TURNS,
      ...[1, 2, 3, 4, 5].flatMap((k) =>
        fromEachSide(Array<string>(k).fill(sexy.notation).join(' '), { repeat: k, last: k > 1 }),
      ),
    ],
    depth: 3,
    goal: 'Put the {piece} corner in',
  },
  3: {
    macros: [...U_TURNS, ...named(rightInsert), ...named(leftInsert)],
    depth: 3,
    goal: 'Put the {piece} edge into the middle layer',
  },
  4: { macros: named(yellowCross), depth: 3, goal: 'Work toward the yellow cross' },
  5: {
    macros: [...U_TURNS, ...named(edgeSwap)],
    depth: 4,
    goal: 'Line up more yellow edges with their centers',
  },
  // A U turn would knock the yellow edges out of line, so only the cycle.
  6: { macros: named(cornerCycle), depth: 3, goal: 'Move more yellow corners to their spots' },
};

/** The color whose center faces `direction` (a unit vector). */
function centerAt(state: CubeState, direction: Vec3): Face {
  return FACES.find((f) => vecEquals(centerNormal(state, f), direction))!;
}

/** How a macro reads in a hint, for the cube as it's held. */
function describe(m: Macro, state: CubeState): string {
  if (m.repeat) {
    const once = formatMoves(m.moves.slice(0, m.moves.length / m.repeat));
    return m.repeat === 1 ? `${once} once` : `${once} ×${m.repeat}`;
  }
  if (m.name && m.front)
    return `${m.name}, facing the ${COLOR_NAMES[centerAt(state, m.front)]} side`;
  return formatMoves(m.moves);
}

/**
 * Fewest algorithms that finish more pieces without undoing any; among those, the one finishing
 * the most, then the shortest.
 */
function searchMacros(state: CubeState, stage: MacroStage): Hint | null {
  const t = heldToCube(state);
  const { depth, goal } = SEARCH[stage];
  const macros = SEARCH[stage].macros.map((m) => ({
    ...m,
    moves: m.moves.map((move) => rotateMove(move, t, 3)),
    ...(m.front ? { front: mulMatVec(t, m.front) } : {}),
  }));
  const start = stageProgress(state);
  // Finishing a stage beats any number of pieces within one.
  const score = (p: StageProgress) => p.stage * 100 + p.done.length;
  let frontier: { cube: CubeState; path: Macro[] }[] = [{ cube: state, path: [] }];

  for (let level = 1; level <= depth; level++) {
    const next: typeof frontier = [];
    let best: { path: Macro[]; length: number; after: StageProgress } | null = null;
    for (const node of frontier) {
      for (const m of macros) {
        if (m.turn && node.path.at(-1)?.turn) continue;
        const cube = applyMoves(node.cube, m.moves);
        const path = [...node.path, m];
        const after = stageProgress(cube);
        if (score(after) > score(start)) {
          const length = path.reduce((sum, p) => sum + p.moves.length, 0);
          const gain = score(after) - (best ? score(best.after) : 0);
          if (!best || gain > 0 || (gain === 0 && length < best.length)) {
            best = { path, length, after };
          }
        }
        if (!m.last) next.push({ cube, path });
      }
    }
    if (best) {
      // The piece finished: one that was left to do and isn't any more.
      const { after } = best;
      const stillTodo = new Set(after.stage > start.stage ? [] : after.todo.map((c) => c.join()));
      const finished = start.todo.find((c) => !stillTodo.has(c.join()));
      const what = goal.replace('{piece}', finished ? pieceName(finished) : '');
      const how = best.path.map((p) => describe(p, state)).join(', then ');
      return { stage, text: `${what}: ${how}.`, moves: best.path.flatMap((p) => p.moves) };
    }
    frontier = next;
  }
  return null;
}

// ---- Stage 1, the white cross: a short search over every face turn ----

const FACE_TURNS: Move[] = FACES.flatMap((f) => parseMoves(`${f} ${f}' ${f}2`));

const placement = (c: Cubie) => `${c.pos.join()}|${c.rot.join()}`;

/** For one edge, how many face turns each of its 24 placements is from `home`. */
function distances(home: Cubie): Map<string, number> {
  const table = new Map([[placement(home), 0]]);
  let frontier = [home];
  for (let d = 1; frontier.length > 0; d++) {
    const next: Cubie[] = [];
    for (const c of frontier) {
      for (const move of FACE_TURNS) {
        const moved = applyMove({ n: 3, cubies: [c] }, move).cubies[0]!;
        if (!table.has(placement(moved))) {
          table.set(placement(moved), d);
          next.push(moved);
        }
      }
    }
    frontier = next;
  }
  return table;
}

/**
 * Fewest face turns that solve one more white edge and leave solved ones solved. Only the four
 * white edges are tracked, and each edge's own distance from home bounds the search (IDA*).
 */
function searchCross(state: CubeState): Hint | null {
  const frame = frameOf(state);
  const edges = state.cubies.filter(
    (c) => cubieColors(3, c).length === 2 && cubieColors(3, c).includes('U'),
  );
  const tables = edges.map((c) => distances({ ...c, pos: mulMatVec(frame, c.home), rot: frame }));
  const keep = edges.map((c, i) => tables[i]!.get(placement(c)) === 0);
  const estimate = (now: readonly Cubie[]) => {
    let worstKept = 0;
    let nearestNew = Infinity;
    now.forEach((c, i) => {
      const d = tables[i]!.get(placement(c))!;
      if (keep[i]) worstKept = Math.max(worstKept, d);
      else nearestNew = Math.min(nearestNew, d);
    });
    return Math.max(worstKept, nearestNew);
  };

  const path: Move[] = [];
  const search = (now: readonly Cubie[], budget: number): readonly Cubie[] | null => {
    const h = estimate(now);
    if (h === 0) return now;
    if (h > budget) return null;
    const last = path.at(-1);
    for (const move of FACE_TURNS) {
      // Never turn the same face twice in a row, and try opposite faces in one order only
      // (they commute).
      if (last && last.axis === move.axis && last.from <= move.from) continue;
      path.push(move);
      const found = search(applyMove({ n: 3, cubies: now }, move).cubies, budget - 1);
      if (found) return found;
      path.pop();
    }
    return null;
  };

  for (let budget = estimate(edges); budget <= 8; budget++) {
    const end = search(edges, budget);
    if (!end) continue;
    const solved = end.findIndex((c, i) => !keep[i] && tables[i]!.get(placement(c)) === 0);
    const name = pieceName(cubieColors(3, edges[solved]!));
    return {
      stage: 1,
      text: `Bring the ${name} edge next to the white center, under its own color: ${path
        .map((m) => formatMove(m))
        .join(' ')}.`,
      moves: [...path],
    };
  }
  return null;
}

// ---- Stage 7, twisting the last corners: the whole sequence at once ----

/** Joins runs of the same turn: U U → U2, U U U → U′, four → nothing. */
function mergeTurns(moves: readonly Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    const last = out.at(-1);
    if (last && last.axis === m.axis && last.from === m.from && last.to === m.to) {
      out.pop();
      const turns = normalizeTurns(last.turns + m.turns);
      if (turns !== 0) out.push({ ...m, turns });
    } else {
      out.push(m);
    }
  }
  return out;
}

/**
 * Twisting a corner scrambles the bottom until every corner is done, so progress can't be
 * measured piece by piece; the hint is the whole sequence, worked out by playing it.
 */
function twistCorners(state: CubeState): Hint | null {
  const t = heldToCube(state);
  const twist = parseMoves(cornerTwist.notation).map((m) => rotateMove(m, t, 3));
  const u = rotateMove(parseMoves('U')[0]!, t, 3);
  const frontRight = mulMatVec(t, [2, 2, 2]);

  let cube = state;
  const moves: Move[] = [];
  const play = (ms: readonly Move[]) => {
    cube = applyMoves(cube, ms);
    moves.push(...ms);
  };
  const yellowUp = () => {
    const corner = cube.cubies.find((c) => vecEquals(c.pos, frontRight))!;
    const center = cube.cubies.find((c) => vecEquals(c.home, [0, -2, 0]))!;
    return vecEquals(mulMatVec(corner.rot, FACE_NORMALS.D), mulMatVec(center.rot, FACE_NORMALS.D));
  };

  for (let i = 0; i < 4; i++) {
    for (let guard = 0; guard < 6 && !yellowUp(); guard++) play(twist);
    play([u]);
  }
  for (let guard = 0; guard < 4 && stageProgress(cube).stage < 7; guard++) play([u]);
  if (stageProgress(cube).stage < 7) return null;

  return {
    stage: 7,
    text:
      `Keep the cube still. For each top corner at the front-right: ${cornerTwist.notation} until ` +
      'its yellow faces up, then turn the top to bring the next one there. The bottom looks ' +
      'scrambled until the last corner is done; keep going!',
    moves: mergeTurns(moves),
  };
}

/**
 * What to do next on a 3x3 cube, following the beginner method from wherever it is.
 * Null when the cube is solved (or, in theory, when no hint is found).
 */
export function nextHint(state: CubeState): Hint | null {
  const { stage } = stageProgress(state);
  if (stage === 7) return null;
  if (stage === 0) return searchCross(state);
  if (stage === 6) return twistCorners(state);
  return searchMacros(state, (stage + 1) as MacroStage);
}
