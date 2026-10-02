import {
  applyMove,
  createScrambledCube,
  createSolvedCube,
  parseMove,
  type CubeState,
  type Move,
} from '@cuberush/cube-core';
import { create } from 'zustand';
import type { TimedMove } from './store';

export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

interface ReplayState {
  seed: string;
  moves: { move: Move; t: number }[];
  durationMs: number;
  /** Replay time in ms of the original solve. */
  clockMs: number;
  speed: ReplaySpeed;
  playing: boolean;
  /** Index of the next move to play. */
  next: number;
  displayed: CubeState;
  animQueue: Move[];
  /** Loads a finished solve and starts playing it from the scramble. */
  open(seed: string, log: readonly TimedMove[], durationMs: number): void;
  restart(): void;
  togglePlay(): void;
  setSpeed(speed: ReplaySpeed): void;
  /** Moves the replay clock forward by real time elapsed. */
  advance(realMs: number): void;
  finishAnimation(): void;
}

/** Plays a recorded solve back on the main cube, at any speed. */
export const useReplay = create<ReplayState>()((set, get) => ({
  seed: '',
  moves: [],
  durationMs: 0,
  clockMs: 0,
  speed: 0.5,
  playing: false,
  next: 0,
  displayed: createSolvedCube(3),
  animQueue: [],

  open(seed, log, durationMs) {
    const moves = log.map(({ m, t }) => ({ move: parseMove(m), t }));
    set({ seed, moves, durationMs });
    get().restart();
  },

  restart() {
    set({
      clockMs: 0,
      next: 0,
      playing: true,
      animQueue: [],
      displayed: createScrambledCube(get().seed).state,
    });
  },

  togglePlay() {
    const { playing, clockMs, durationMs } = get();
    if (!playing && clockMs >= durationMs) get().restart();
    else set({ playing: !playing });
  },

  setSpeed(speed) {
    set({ speed });
  },

  advance(realMs) {
    const { playing, speed, clockMs, durationMs, moves, next, animQueue } = get();
    if (!playing) return;
    const clock = Math.min(durationMs, clockMs + realMs * speed);
    let end = next;
    while (end < moves.length && moves[end]!.t <= clock) end++;
    set({
      clockMs: clock,
      next: end,
      animQueue:
        end > next ? [...animQueue, ...moves.slice(next, end).map((m) => m.move)] : animQueue,
      playing: clock < durationMs,
    });
  },

  finishAnimation() {
    const { animQueue, displayed } = get();
    const [move, ...rest] = animQueue;
    if (move) set({ displayed: applyMove(displayed, move), animQueue: rest });
  },
}));
