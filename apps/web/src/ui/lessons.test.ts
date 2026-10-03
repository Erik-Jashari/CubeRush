import {
  ALGORITHMS,
  applyMoves,
  createSolvedCube,
  getStickers,
  isSolved,
  parseMoves,
  practiceCube,
  stageReached,
  type CubeState,
  type Face,
  type Vec3,
} from '@cuberush/cube-core';
import { LESSON_IDS } from '@cuberush/api';
import { describe, expect, it } from 'vitest';
import { lessonsToUpload } from '../game/tutorial';
import { LESSONS } from './lessons';

/**
 * Follows each lesson's written instructions the way a person would, on many practice cubes,
 * and checks they really finish the step. If a lesson's advice is wrong, these fail.
 */

const UP: Vec3 = [0, 1, 0];
const SIDES = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0] } as const;
type Side = keyof typeof SIDES;
const U_TURNS = ['', 'U', 'U2', "U'"];
const SPINS = ['', 'y', 'y2', "y'"];

const same = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
const run = (s: CubeState, moves: string) => (moves ? applyMoves(s, parseMoves(moves)) : s);

function colorAt(s: CubeState, pos: Vec3, normal: Vec3): Face | undefined {
  return getStickers(s).find((st) => same(st.pos, pos) && same(st.normal, normal))?.color;
}
const center = (s: CubeState, d: Vec3) => colorAt(s, [d[0] * 2, d[1] * 2, d[2] * 2], d);
const topEdge = (d: Vec3): Vec3 => [d[0] * 2, 2, d[2] * 2];

const yellowUp = (s: CubeState, side: Side) =>
  colorAt(s, topEdge(SIDES[side]), UP) === center(s, UP);
const edgeMatched = (s: CubeState, side: Side) =>
  colorAt(s, topEdge(SIDES[side]), SIDES[side]) === center(s, SIDES[side]);

const FRONT_RIGHT: Vec3 = [2, 2, 2];
function frontRightPlaced(s: CubeState): boolean {
  const colors = getStickers(s)
    .filter((st) => same(st.pos, FRONT_RIGHT))
    .map((st) => st.color)
    .sort();
  const wanted = [center(s, UP), center(s, SIDES.front), center(s, SIDES.right)].sort();
  return same<string | undefined>(colors, wanted);
}
const frontRightTwisted = (s: CubeState) => colorAt(s, FRONT_RIGHT, UP) !== center(s, UP);

const { yellowCross, edgeSwap, cornerCycle, cornerTwist } = ALGORITHMS;
const SEEDS = Array.from({ length: 50 }, (_, i) => `lesson-${i}`);

describe('lesson instructions solve their step', () => {
  it('4. yellow cross: hold a dot, L (back-left) or line (left-right); at most 3 goes', () => {
    for (const seed of SEEDS) {
      let s = practiceCube(4, seed).state;
      let goes = 0;
      while (stageReached(s) < 4 && goes < 3) {
        const held = U_TURNS.map((turn) => run(s, turn)).find((t) => {
          const up = (Object.keys(SIDES) as Side[]).filter((side) => yellowUp(t, side));
          const ell = up.length === 2 && up.includes('back') && up.includes('left');
          const line = up.length === 2 && up.includes('left') && up.includes('right');
          return up.length === 0 || ell || line;
        });
        expect(held, `${seed}: no recognisable shape`).toBeDefined();
        s = run(held!, yellowCross.notation);
        goes++;
      }
      expect(stageReached(s), seed).toBeGreaterThanOrEqual(4);
    }
  });

  it('5. yellow edges: a matching pair at back and right is fixed by one edge swap', () => {
    for (const seed of SEEDS) {
      let s = practiceCube(5, seed).state;
      const lined = () => U_TURNS.some((t) => stageReached(run(s, t)) >= 5);
      let swaps = 0;
      while (!lined() && swaps < 2) {
        const held = U_TURNS.flatMap((turn) =>
          SPINS.map((spin) => run(s, `${turn} ${spin}`.trim())),
        ).find((t) => edgeMatched(t, 'back') && edgeMatched(t, 'right'));
        if (held) {
          s = run(held, edgeSwap.notation);
          // The lesson promises this finishes the step with no further turns.
          expect(stageReached(s), `${seed}: pair case`).toBeGreaterThanOrEqual(5);
        } else {
          s = run(s, edgeSwap.notation); // opposite pair: once from anywhere, then look again
        }
        swaps++;
      }
      expect(lined(), seed).toBe(true);
    }
  });

  it('6. place corners: a correct corner at front right, then the cycle; at most 3 goes', () => {
    for (const seed of SEEDS) {
      let s = practiceCube(6, seed).state;
      let goes = 0;
      while (stageReached(s) < 6 && goes < 3) {
        const spin = SPINS.find((sp) => frontRightPlaced(run(s, sp)));
        s = run(s, `${spin ?? ''} ${cornerCycle.notation}`.trim());
        goes++;
      }
      expect(stageReached(s), seed).toBeGreaterThanOrEqual(6);
    }
  });

  it("7. twist corners: R' D' R D until yellow is up, then only U to the next corner", () => {
    for (const seed of SEEDS) {
      let s = practiceCube(7, seed).state;
      for (let corner = 0; corner < 4; corner++) {
        for (let rep = 0; rep < 6 && frontRightTwisted(s); rep++) s = run(s, cornerTwist.notation);
        s = run(s, 'U');
      }
      const finished = U_TURNS.map((t) => run(s, t)).some((t) => stageReached(t) === 7);
      expect(finished, seed).toBe(true);
    }
  });
});

describe('lesson data', () => {
  it('every moves step is valid notation and every lesson has steps', () => {
    for (const lesson of LESSONS) {
      expect(lesson.steps.length, lesson.id).toBeGreaterThan(0);
      for (const step of lesson.steps) {
        if (step.kind === 'moves') expect(() => parseMoves(step.moves)).not.toThrow();
      }
    }
  });

  it('each Moves 101 lesson ends back on a solved cube', () => {
    for (const lesson of LESSONS.filter((l) => l.course === 'moves')) {
      let cube = createSolvedCube(3);
      for (const step of lesson.steps) {
        if (step.kind !== 'moves') continue;
        if (step.fresh) cube = createSolvedCube(3);
        cube = applyMoves(cube, parseMoves(step.moves));
      }
      expect(isSolved(cube), lesson.id).toBe(true);
    }
  });
});

describe('lesson ids', () => {
  it('the server knows every lesson, and no others', () => {
    expect(LESSONS.map((l) => l.id).sort()).toEqual([...LESSON_IDS].sort());
  });

  it('uploads only lessons the account lacks, skipping ids from old versions', () => {
    expect(lessonsToUpload(['faces', 'cross', 'retired-lesson'], ['faces'])).toEqual(['cross']);
    expect(lessonsToUpload(['faces'], ['faces', 'sune'])).toEqual([]);
  });
});
