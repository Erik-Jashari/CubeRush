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

export interface GhostInfo {
  /** Who the ghost is, e.g. "Alice" or "Your last run". */
  label: string;
  timeMs: number;
}

interface GhostState {
  info: GhostInfo | null;
  moves: { move: Move; t: number }[];
  /** Index of the next move to play. */
  next: number;
  displayed: CubeState;
  animQueue: Move[];
  /** Sets up a ghost solving `seed` with a recorded move list; bad data means no ghost. */
  load(seed: string, info: GhostInfo, moves: readonly TimedMove[]): void;
  clear(): void;
  /** Queues every move the ghost had made `elapsedMs` into its solve. */
  advanceTo(elapsedMs: number): void;
  finishAnimation(): void;
}

const EMPTY = {
  info: null,
  moves: [],
  next: 0,
  displayed: createSolvedCube(3),
  animQueue: [],
};

/** A recorded solve replayed in step with the player's clock, for racing against. */
export const useGhost = create<GhostState>()((set, get) => ({
  ...EMPTY,

  load(seed, info, timed) {
    try {
      const moves = timed.map(({ m, t }) => ({ move: parseMove(m), t }));
      set({ ...EMPTY, info, moves, displayed: createScrambledCube(seed).state });
    } catch {
      set(EMPTY);
    }
  },

  clear() {
    set(EMPTY);
  },

  advanceTo(elapsedMs) {
    const { moves, next, animQueue } = get();
    let end = next;
    while (end < moves.length && moves[end]!.t <= elapsedMs) end++;
    if (end === next) return;
    set({ next: end, animQueue: [...animQueue, ...moves.slice(next, end).map((m) => m.move)] });
  },

  finishAnimation() {
    const { animQueue, displayed } = get();
    const [move, ...rest] = animQueue;
    if (move) set({ displayed: applyMove(displayed, move), animQueue: rest });
  },
}));
