import { dailySeed, utcDateKey, type Mode } from '@cuberush/api';
import {
  advanceSurvival,
  applyMove,
  BLINDFOLD_MEMORIZE_MS,
  computePoints,
  computeSurvivalPoints,
  createScrambledCube,
  createSolvedCube,
  formatMove,
  invertMove,
  isCubeRotation,
  isSolved,
  modeMultiplier,
  startSurvival,
  survivalTurn,
  type CubeState,
  type Move,
  type PointsBreakdown,
  type SurvivalEvent,
  type SurvivalRun,
} from '@cuberush/cube-core';
import { create } from 'zustand';

export type GameMode = Mode;
export type Screen = 'home' | 'play' | 'leaderboard' | 'challenge';
/**
 * `ready`: scrambled, waiting for the first turn. `inspecting`: optional look before the clock.
 * `memorizing`: blindfold preview, turns locked. The timer runs only while `solving`.
 */
export type Status = 'ready' | 'inspecting' | 'memorizing' | 'solving' | 'solved';

export const INSPECTION_MS = 15_000;

/** One turn made during a solve; `t` is ms since the timer started. Sent to the server later. */
export interface TimedMove {
  m: string;
  t: number;
}

export interface SolveResult {
  /** Solve time, or for survival how long the run lasted. */
  timeMs: number;
  moveCount: number;
  usedUndo: boolean;
  points: PointsBreakdown;
  /** Survival only: waves solved. */
  cleared: number | null;
}

export interface StartOptions {
  inspection: boolean;
  /** Overrides the seed; otherwise each mode picks its own. */
  seed?: string;
}

interface GameState {
  screen: Screen;
  mode: GameMode;
  seed: string;
  scramble: Move[];
  /** The true cube state; turns apply here immediately. */
  cube: CubeState;
  /** What the 3D view currently shows; catches up with `cube` by playing `animQueue`. */
  displayed: CubeState;
  animQueue: Move[];
  status: Status;
  /** When inspection or blindfold memorization ends and the clock starts. */
  countdownEndsAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  log: TimedMove[];
  /** Player turns that undo can still take back. */
  undoStack: Move[];
  usedUndo: boolean;
  moveCount: number;
  /** Blindfold: the player revealed the stickers. */
  peeked: boolean;
  /** Survival: waves, lives and deadlines. */
  survival: SurvivalRun | null;
  result: SolveResult | null;

  startGame(mode: GameMode, options: StartOptions, now?: number): void;
  goHome(): void;
  showLeaderboard(): void;
  showChallenge(): void;
  turn(move: Move, now?: number): void;
  undo(now?: number): void;
  /** Starts the timer when inspection or memorization runs out. */
  endCountdown(now?: number): void;
  /** Blindfold: shows the stickers again, giving up the blindfold bonus. */
  peek(): void;
  /** Survival: runs wave deadlines up to `now`. Call regularly while solving. */
  tick(now?: number): void;
  /** Called by the 3D view when the first queued animation has finished playing. */
  finishAnimation(): void;
}

/** Turns are allowed before and during the solve, except while memorizing a blindfold cube. */
export function canTurn(s: Pick<GameState, 'screen' | 'status'>): boolean {
  return (
    s.screen === 'play' &&
    (s.status === 'ready' || s.status === 'inspecting' || s.status === 'solving')
  );
}

/** Blindfold hides the stickers from the moment the clock starts until solved (or a peek). */
export function colorsHidden(s: Pick<GameState, 'mode' | 'status' | 'peeked'>): boolean {
  return s.mode === 'blindfold' && s.status === 'solving' && !s.peeked;
}

function randomSeed(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function seedFor(mode: GameMode, options: StartOptions): string {
  if (options.seed !== undefined) return options.seed;
  if (mode === 'daily') return dailySeed(utcDateKey());
  return randomSeed(mode === 'blindfold' ? 'blind' : mode);
}

const SOLVED = createSolvedCube(3);

const BLANK_ROUND = {
  animQueue: [] as Move[],
  countdownEndsAt: null as number | null,
  startedAt: null as number | null,
  finishedAt: null as number | null,
  log: [] as TimedMove[],
  undoStack: [] as Move[],
  usedUndo: false,
  moveCount: 0,
  peeked: false,
  survival: null as SurvivalRun | null,
  result: null as SolveResult | null,
};

/** Menus show a solved cube that can't be turned. */
function idleScreen(screen: Exclude<Screen, 'play'>) {
  return {
    screen,
    ...BLANK_ROUND,
    seed: '',
    scramble: [],
    cube: SOLVED,
    displayed: SOLVED,
    status: 'ready' as Status,
  };
}

function freshRound(mode: GameMode, seed: string, inspection: boolean, now: number) {
  if (mode === 'survival') {
    // The clock starts at once: wave 0 is already ticking.
    const { run, events } = startSurvival(seed);
    const first = events[0]!;
    return {
      ...BLANK_ROUND,
      seed,
      scramble: first.kind === 'wave' ? first.moves : [],
      cube: run.cube,
      displayed: run.cube,
      status: 'solving' as Status,
      startedAt: now,
      survival: run,
    };
  }
  const { scramble, state } = createScrambledCube(seed);
  const countdown = mode === 'blindfold' ? BLINDFOLD_MEMORIZE_MS : inspection ? INSPECTION_MS : 0;
  const status: Status = mode === 'blindfold' ? 'memorizing' : inspection ? 'inspecting' : 'ready';
  return {
    ...BLANK_ROUND,
    seed,
    scramble,
    cube: state,
    displayed: state,
    status,
    countdownEndsAt: countdown > 0 ? now + countdown : null,
  };
}

/** Wave moves to animate, from survival events. */
function waveMovesOf(events: readonly SurvivalEvent[]): Move[] {
  return events.flatMap((e) => (e.kind === 'wave' ? e.moves : []));
}

export const useGame = create<GameState>()((set, get) => {
  /** Applies one turn to the cube, starting or finishing the timer as needed. */
  const applyTurn = (move: Move, now: number, isUndo: boolean): void => {
    const s = get();
    if (!canTurn(s)) return;
    if (isUndo && s.undoStack.length === 0) return;

    const startedAt = s.status === 'solving' ? s.startedAt! : now;
    const timeMs = now - startedAt;
    const moveCount = s.moveCount + (isCubeRotation(move, s.cube.n) ? 0 : 1);
    const usedUndo = s.usedUndo || isUndo;
    const logged = {
      startedAt,
      countdownEndsAt: null,
      log: [...s.log, { m: formatMove(move, s.cube.n), t: Math.round(timeMs) }],
      undoStack: isUndo ? s.undoStack.slice(0, -1) : [...s.undoStack, move],
      usedUndo,
      moveCount,
    };

    if (s.survival) {
      const step = survivalTurn(s.survival, move, timeMs);
      if (!step) return; // The run ended a moment ago; tick() will finish it.
      const waves = waveMovesOf(step.events);
      set({
        ...logged,
        cube: step.run.cube,
        survival: step.run,
        animQueue: [...s.animQueue, move, ...waves],
        // A new wave can't be undone back into the previous one.
        ...(waves.length > 0 ? { undoStack: [], scramble: waves } : {}),
      });
      return;
    }

    const cube = applyMove(s.cube, move);
    const solved = isSolved(cube);
    const points = computePoints({
      timeMs,
      moveCount,
      usedUndo,
      modeMultiplier: modeMultiplier(s.mode, { peeked: s.peeked }),
    });
    set({
      ...logged,
      cube,
      animQueue: [...s.animQueue, move],
      status: solved ? 'solved' : 'solving',
      finishedAt: solved ? now : null,
      result: solved ? { timeMs, moveCount, usedUndo, points, cleared: null } : null,
    });
  };

  return {
    mode: 'quick',
    ...idleScreen('home'),

    startGame(mode, options, now = performance.now()) {
      const seed = seedFor(mode, options);
      set({ screen: 'play', mode, ...freshRound(mode, seed, options.inspection, now) });
    },

    goHome() {
      set(idleScreen('home'));
    },

    showLeaderboard() {
      set(idleScreen('leaderboard'));
    },

    showChallenge() {
      set(idleScreen('challenge'));
    },

    turn(move, now = performance.now()) {
      applyTurn(move, now, false);
    },

    undo(now = performance.now()) {
      const last = get().undoStack.at(-1);
      if (last && get().status === 'solving') applyTurn(invertMove(last), now, true);
    },

    endCountdown(now = performance.now()) {
      const s = get();
      if (s.status === 'inspecting' || s.status === 'memorizing') {
        set({ status: 'solving', startedAt: now, countdownEndsAt: null });
      }
    },

    peek() {
      if (get().mode === 'blindfold') set({ peeked: true });
    },

    tick(now = performance.now()) {
      const s = get();
      if (!s.survival || s.status !== 'solving' || s.startedAt === null) return;
      const { run, events } = advanceSurvival(s.survival, now - s.startedAt);
      if (events.length === 0) return;
      const waves = waveMovesOf(events);
      const over = run.endedAt !== null;
      set({
        survival: run,
        cube: run.cube,
        animQueue: [...s.animQueue, ...waves],
        ...(waves.length > 0 ? { undoStack: [], scramble: waves } : {}),
        ...(over
          ? {
              status: 'solved' as Status,
              finishedAt: s.startedAt + run.endedAt!,
              result: {
                timeMs: run.endedAt!,
                moveCount: s.moveCount,
                usedUndo: s.usedUndo,
                points: computeSurvivalPoints({ cleared: run.cleared }),
                cleared: run.cleared,
              },
            }
          : {}),
      });
    },

    finishAnimation() {
      const { animQueue, displayed } = get();
      const [move, ...rest] = animQueue;
      if (move) set({ displayed: applyMove(displayed, move), animQueue: rest });
    },
  };
});
