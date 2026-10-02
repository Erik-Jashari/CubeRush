import {
  applyMove,
  computePoints,
  createScrambledCube,
  createSolvedCube,
  formatMove,
  invertMove,
  isCubeRotation,
  isSolved,
  type CubeState,
  type Move,
  type PointsBreakdown,
} from '@cuberush/cube-core';
import { create } from 'zustand';
import { utcDateKey } from './time';

export type GameMode = 'quick' | 'daily';
export type Screen = 'home' | 'play';
/** `ready`: scrambled, waiting for the first turn. The timer runs only while `solving`. */
export type Status = 'ready' | 'inspecting' | 'solving' | 'solved';

export const INSPECTION_MS = 15_000;

/** One turn made during a solve; `t` is ms since the timer started. Sent to the server later. */
export interface TimedMove {
  m: string;
  t: number;
}

export interface SolveResult {
  timeMs: number;
  moveCount: number;
  usedUndo: boolean;
  points: PointsBreakdown;
}

export interface StartOptions {
  inspection: boolean;
  /** Overrides the seed; quick play otherwise gets a random one. */
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
  inspection: boolean;
  inspectionEndsAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  log: TimedMove[];
  /** Player turns that undo can still take back. */
  undoStack: Move[];
  usedUndo: boolean;
  moveCount: number;
  result: SolveResult | null;

  startGame(mode: GameMode, options: StartOptions, now?: number): void;
  restart(now?: number): void;
  goHome(): void;
  turn(move: Move, now?: number): void;
  undo(now?: number): void;
  /** Starts the timer when inspection runs out without a turn. */
  endInspection(now?: number): void;
  /** Called by the 3D view when the first queued animation has finished playing. */
  finishAnimation(): void;
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function seedFor(mode: GameMode, options: StartOptions): string {
  if (options.seed !== undefined) return options.seed;
  return mode === 'daily' ? `daily-${utcDateKey()}` : `quick-${randomSeed()}`;
}

const SOLVED = createSolvedCube(3);

function freshRound(seed: string, inspection: boolean, now: number) {
  const { scramble, state } = createScrambledCube(seed);
  return {
    seed,
    scramble,
    cube: state,
    displayed: state,
    animQueue: [],
    status: (inspection ? 'inspecting' : 'ready') as Status,
    inspection,
    inspectionEndsAt: inspection ? now + INSPECTION_MS : null,
    startedAt: null,
    finishedAt: null,
    log: [],
    undoStack: [],
    usedUndo: false,
    moveCount: 0,
    result: null,
  };
}

export const useGame = create<GameState>()((set, get) => {
  /** Applies one turn to the cube, starting or finishing the timer as needed. */
  const applyTurn = (move: Move, now: number, isUndo: boolean): void => {
    const s = get();
    if (s.screen !== 'play' || s.status === 'solved') return;
    if (isUndo && s.undoStack.length === 0) return;

    const startedAt = s.status === 'solving' ? s.startedAt! : now;
    const cube = applyMove(s.cube, move);
    const moveCount = s.moveCount + (isCubeRotation(move, cube.n) ? 0 : 1);
    const usedUndo = s.usedUndo || isUndo;
    const solved = isSolved(cube);
    const timeMs = now - startedAt;

    set({
      cube,
      animQueue: [...s.animQueue, move],
      startedAt,
      inspectionEndsAt: null,
      log: [...s.log, { m: formatMove(move, cube.n), t: Math.round(timeMs) }],
      undoStack: isUndo ? s.undoStack.slice(0, -1) : [...s.undoStack, move],
      usedUndo,
      moveCount,
      status: solved ? 'solved' : 'solving',
      finishedAt: solved ? now : null,
      result: solved
        ? { timeMs, moveCount, usedUndo, points: computePoints({ timeMs, moveCount, usedUndo }) }
        : null,
    });
  };

  return {
    screen: 'home',
    mode: 'quick',
    ...freshRound('home', false, 0),
    cube: SOLVED,
    displayed: SOLVED,
    scramble: [],

    startGame(mode, options, now = performance.now()) {
      set({ screen: 'play', mode, ...freshRound(seedFor(mode, options), options.inspection, now) });
    },

    restart(now = performance.now()) {
      const s = get();
      set(freshRound(s.seed, s.inspection, now));
    },

    goHome() {
      set({
        screen: 'home',
        ...freshRound('home', false, 0),
        cube: SOLVED,
        displayed: SOLVED,
        scramble: [],
      });
    },

    turn(move, now = performance.now()) {
      applyTurn(move, now, false);
    },

    undo(now = performance.now()) {
      const last = get().undoStack.at(-1);
      if (last && get().status === 'solving') applyTurn(invertMove(last), now, true);
    },

    endInspection(now = performance.now()) {
      if (get().status === 'inspecting') {
        set({ status: 'solving', startedAt: now, inspectionEndsAt: null });
      }
    },

    finishAnimation() {
      const { animQueue, displayed } = get();
      const [move, ...rest] = animQueue;
      if (move) set({ displayed: applyMove(displayed, move), animQueue: rest });
    },
  };
});
