import { ALGORITHMS } from './algorithms.js';
import { applyMoves, createSolvedCube, type CubeState } from './cube.js';
import type { Move } from './move.js';
import { parseMoves } from './notation.js';
import { createRng } from './rng.js';
import { generateScramble } from './scramble.js';
import { stageReached, type Stage } from './stages.js';

const { rightInsert, leftInsert, yellowCross, sune, cornerCycle, cornerTwist } = ALGORITHMS;
const twistTwice = `${cornerTwist.notation} ${cornerTwist.notation}`;
/** Twists one corner one way and another the opposite way, leaving everything else solved. */
const TWIST_PAIR = `${twistTwice} U ${twistTwice} ${twistTwice} U'`;
const TURNS = ['U', "U'", 'U2', 'y', "y'", 'y2'];
const SPIN = ['y', "y'", 'y2'];

/**
 * Sequences that leave the earlier stages intact while scrambling the rest, so a random mix of
 * them gives a practice cube for that stage. Each stage's list is checked by its tests.
 */
const MACROS: Readonly<Record<Exclude<Stage, 1>, readonly string[]>> = {
  // Corner inserts keep the cross: the cross edge they lift comes straight back.
  2: ["R U R'", "R U' R'", "F' U' F", "F' U F", "L' U' L", "L' U L", "B U B'", "B U' B'", ...TURNS],
  3: [rightInsert.notation, leftInsert.notation, ...TURNS],
  4: [yellowCross.notation, sune.notation, cornerCycle.notation, TWIST_PAIR, ...TURNS],
  5: [sune.notation, cornerCycle.notation, TWIST_PAIR, ...TURNS],
  // Once yellow edges are home, only moves that keep them home.
  6: [cornerCycle.notation, TWIST_PAIR, ...SPIN],
  7: [TWIST_PAIR, ...SPIN],
};

export interface PracticeCube {
  state: CubeState;
  /** Moves from a solved cube (white on top) to this state. */
  setup: Move[];
}

/** White on the bottom, yellow on top, as the beginner method holds the cube. */
const HOLD = 'z2';

/**
 * A cube with every stage before `stage` done and that stage still to do.
 * Deterministic for a given seed.
 */
export function practiceCube(stage: Stage, seed: string): PracticeCube {
  const rng = createRng(`practice:${stage}:${seed}`);
  const solved = createSolvedCube(3);
  for (let attempt = 0; attempt < 500; attempt++) {
    let setup: Move[];
    if (stage === 1) {
      setup = [...parseMoves(HOLD), ...generateScramble(`${seed}:${attempt}`)];
    } else {
      const macros = MACROS[stage];
      const length = 4 + rng.int(6);
      const picks = Array.from({ length }, () => rng.pick(macros));
      setup = parseMoves([HOLD, ...picks].join(' '));
    }
    const state = applyMoves(solved, setup);
    if (stageReached(state) === stage - 1) return { state, setup };
  }
  throw new Error(`Could not build a practice cube for stage ${stage}`);
}
