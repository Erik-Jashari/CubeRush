import { describe, expect, it } from 'vitest';
import { isSolved } from './cube.js';
import { modeMultiplier } from './modes.js';
import { invertMoves, type Move } from './move.js';
import { computeSurvivalPoints } from './scoring.js';
import {
  advanceSurvival,
  replaySurvival,
  startSurvival,
  survivalTurn,
  SURVIVAL,
  waveLength,
  waveMoves,
  type SurvivalRun,
} from './survival.js';

const SEED = 'survival-test';
const W = SURVIVAL.waveMs;

/** Solves the current wave by undoing every wave applied since the cube was last solved. */
function solveCurrent(run: SurvivalRun, t: number, pending: Move[]) {
  let current = run;
  const timed: { move: Move; t: number }[] = [];
  for (const [i, move] of invertMoves(pending).entries()) {
    const step = survivalTurn(current, move, t + i)!;
    timed.push({ move, t: t + i });
    current = step.run;
  }
  return { run: current, timed };
}

describe('waves', () => {
  it('grow slowly and are deterministic per seed', () => {
    expect([0, 1, 2, 3, 4].map(waveLength)).toEqual([3, 3, 4, 4, 5]);
    expect(waveMoves(SEED, 2)).toEqual(waveMoves(SEED, 2));
    expect(waveMoves(SEED, 2)).not.toEqual(waveMoves('other', 2));
  });
});

describe('survival run', () => {
  it('starts on wave 0 with full lives', () => {
    const { run, events } = startSurvival(SEED);
    expect(run).toMatchObject({ wave: 0, lives: 3, cleared: 0, endedAt: null });
    expect(isSolved(run.cube)).toBe(false);
    expect(events).toEqual([{ kind: 'wave', wave: 0, moves: waveMoves(SEED, 0), at: 0 }]);
  });

  it('solving a wave starts the next one at once with a fresh deadline', () => {
    const { run } = startSurvival(SEED);
    const solved = solveCurrent(run, 5000, waveMoves(SEED, 0)).run;
    expect(solved).toMatchObject({ wave: 1, cleared: 1, lives: 3 });
    expect(solved.waveStartedAt).toBe(5000 + waveLength(0) - 1);
    expect(isSolved(solved.cube)).toBe(false);
  });

  it('missing a deadline costs a life and piles the next wave on top', () => {
    const { run } = startSurvival(SEED);
    const { run: after, events } = advanceSurvival(run, W);
    expect(after).toMatchObject({ wave: 1, lives: 2, waveStartedAt: W, cleared: 0 });
    expect(events.map((e) => e.kind)).toEqual(['lifeLost', 'wave']);
    // Undoing both waves gets back to solved.
    const back = solveCurrent(after, W + 10, [...waveMoves(SEED, 0), ...waveMoves(SEED, 1)]);
    expect(back.run.cleared).toBe(1);
  });

  it('ends when the last life is lost', () => {
    const { run } = startSurvival(SEED);
    const { run: over, events } = advanceSurvival(run, 10 * W);
    expect(over).toMatchObject({ lives: 0, endedAt: 3 * W });
    expect(events.at(-1)).toEqual({ kind: 'over', at: 3 * W });
    expect(survivalTurn(over, waveMoves(SEED, 0)[0]!, 3 * W + 1)).toBeNull();
  });
});

describe('replaySurvival', () => {
  it('reproduces a run from its timed moves', () => {
    let { run } = startSurvival(SEED);
    const all: { move: Move; t: number }[] = [];
    for (const [wave, start] of [
      [0, 1000],
      [1, 15_000],
      [2, 30_000],
    ] as const) {
      const step = solveCurrent(run, start, waveMoves(SEED, wave));
      run = step.run;
      all.push(...step.timed);
    }
    const lastSolve = all.at(-1)!.t;
    expect(replaySurvival(SEED, all)).toEqual({
      valid: true,
      cleared: 3,
      // Three lives lost, one wave length apart, after the last solve.
      survivedMs: lastSolve + 3 * W,
    });
  });

  it('rejects moves made after the run ended', () => {
    const late = [{ move: waveMoves(SEED, 0)[0]!, t: 3 * W + 5 }];
    expect(replaySurvival(SEED, late).valid).toBe(false);
  });

  it('an idle run lasts three wave lengths', () => {
    expect(replaySurvival(SEED, [])).toEqual({ valid: true, cleared: 0, survivedMs: 3 * W });
  });
});

describe('mode scoring', () => {
  it('pays survival per wave, boosted by streak', () => {
    expect(computeSurvivalPoints({ cleared: 0 }).total).toBe(0);
    expect(computeSurvivalPoints({ cleared: 4 })).toMatchObject({ waves: 600, total: 600 });
    expect(computeSurvivalPoints({ cleared: 4, streak: 2 }).total).toBe(660);
  });

  it('doubles blindfold points unless the player peeked', () => {
    expect(modeMultiplier('blindfold')).toBe(2);
    expect(modeMultiplier('blindfold', { peeked: true })).toBe(1);
    expect(modeMultiplier('quick')).toBe(1);
  });
});
