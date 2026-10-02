import { applyMove, applyMoves, createSolvedCube, isSolved, type CubeState } from './cube.js';
import type { Move } from './move.js';
import { generateScramble } from './scramble.js';

/**
 * Survival: the cube gets a short scramble ("wave"). Solve it before the wave's time runs out
 * and the next wave starts on the solved cube. Run out of time and you lose a life while the
 * next wave piles on top of the mess. The run ends when the last life is lost.
 *
 * Everything is derived from the seed and the move timestamps, so the server can replay a run.
 */
export const SURVIVAL = {
  waveMs: 20_000,
  lives: 3,
  /** Wave i has `firstWaveLength + floor(i / 2)` moves: 3, 3, 4, 4, 5, ... */
  firstWaveLength: 3,
} as const;

export function waveLength(wave: number): number {
  return SURVIVAL.firstWaveLength + Math.floor(wave / 2);
}

export function waveMoves(seed: string, wave: number): Move[] {
  return generateScramble(`${seed}:wave:${wave}`, { length: waveLength(wave) });
}

export interface SurvivalRun {
  readonly seed: string;
  readonly cube: CubeState;
  /** Index of the wave currently on the cube. */
  readonly wave: number;
  /** Run time (ms) at which the current wave started; it must be solved within `waveMs`. */
  readonly waveStartedAt: number;
  readonly lives: number;
  /** Waves solved. */
  readonly cleared: number;
  /** Run time when the last life was lost, or null while the run is going. */
  readonly endedAt: number | null;
}

export type SurvivalEvent =
  | { kind: 'wave'; wave: number; moves: Move[]; at: number }
  | { kind: 'cleared'; wave: number; at: number }
  | { kind: 'lifeLost'; livesLeft: number; at: number }
  | { kind: 'over'; at: number };

export interface SurvivalStep {
  run: SurvivalRun;
  events: SurvivalEvent[];
}

function nextWave(run: SurvivalRun, at: number, events: SurvivalEvent[]): SurvivalRun {
  const wave = run.wave + 1;
  const moves = waveMoves(run.seed, wave);
  events.push({ kind: 'wave', wave, moves, at });
  return { ...run, wave, waveStartedAt: at, cube: applyMoves(run.cube, moves) };
}

/** A new run with wave 0 on the cube at time 0. */
export function startSurvival(seed: string): SurvivalStep {
  const moves = waveMoves(seed, 0);
  const run: SurvivalRun = {
    seed,
    cube: applyMoves(createSolvedCube(3), moves),
    wave: 0,
    waveStartedAt: 0,
    lives: SURVIVAL.lives,
    cleared: 0,
    endedAt: null,
  };
  return { run, events: [{ kind: 'wave', wave: 0, moves, at: 0 }] };
}

/** Runs every wave deadline up to and including time `t`. */
export function advanceSurvival(start: SurvivalRun, t: number): SurvivalStep {
  const events: SurvivalEvent[] = [];
  let run = start;
  while (run.endedAt === null && t >= run.waveStartedAt + SURVIVAL.waveMs) {
    const deadline = run.waveStartedAt + SURVIVAL.waveMs;
    const lives = run.lives - 1;
    events.push({ kind: 'lifeLost', livesLeft: lives, at: deadline });
    if (lives === 0) {
      run = { ...run, lives, endedAt: deadline };
      events.push({ kind: 'over', at: deadline });
    } else {
      run = nextWave({ ...run, lives }, deadline, events);
    }
  }
  return { run, events };
}

/** The player turns a layer at time `t`. Returns null if the run was already over by then. */
export function survivalTurn(start: SurvivalRun, move: Move, t: number): SurvivalStep | null {
  const advanced = advanceSurvival(start, t);
  if (advanced.run.endedAt !== null) return null;
  const events = advanced.events;
  let run: SurvivalRun = { ...advanced.run, cube: applyMove(advanced.run.cube, move) };
  if (isSolved(run.cube)) {
    events.push({ kind: 'cleared', wave: run.wave, at: t });
    run = nextWave({ ...run, cleared: run.cleared + 1 }, t, events);
  }
  return { run, events };
}

export interface SurvivalReplay {
  /** False if a move came after the run had already ended. */
  valid: boolean;
  cleared: number;
  /** How long the run lasted (until the last life was lost). */
  survivedMs: number;
}

/** Replays a whole run from its timed moves, then lets the clock run out. */
export function replaySurvival(
  seed: string,
  moves: readonly { move: Move; t: number }[],
): SurvivalReplay {
  let { run } = startSurvival(seed);
  for (const { move, t } of moves) {
    const step = survivalTurn(run, move, t);
    if (!step) return { valid: false, cleared: run.cleared, survivedMs: run.endedAt ?? 0 };
    run = step.run;
  }
  run = advanceSurvival(run, Infinity).run;
  return { valid: true, cleared: run.cleared, survivedMs: run.endedAt! };
}
