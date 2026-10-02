import type { TimedMoveDto } from '@cuberush/api';
import {
  countMoves,
  invertMove,
  movesEqual,
  NotationError,
  parseMove,
  replaySurvival,
  verifySolve,
  type Move,
} from '@cuberush/cube-core';

/**
 * Limits on what a submitted solve may claim. The server replays every move list, so a solve is
 * always real; these rules catch timings no person could produce. Times come from the player's
 * browser, so they can't prove a fake timeline wrong, only make it hard to pass.
 */
export const RULES = {
  /** Attempts must be submitted within this long of being created. */
  attemptTtlMs: 2 * 60 * 60 * 1000,
  /** Allowance for clock drift and network delay between the attempt starting and the first turn. */
  clockSlackMs: 2_000,
  /** Fastest sustained pace accepted. Top speedcubers reach ~12 on a real cube; dragging is slower. */
  maxTurnsPerSecond: 12,
  /** Fewer turns than this means a computer solver: people need 40+ at speed. */
  minMoveCount: 20,
} as const;

export type RejectReason =
  | 'invalid_move'
  | 'invalid_timestamps'
  | 'not_solved'
  | 'time_mismatch'
  | 'too_fast'
  | 'implausible_solution';

export interface SubmissionInput {
  seed: string;
  /** Server time when the attempt was created. */
  attemptCreatedAt: number;
  /** Server time now. */
  now: number;
  moves: readonly TimedMoveDto[];
  usedUndo: boolean;
}

type Rejection = { ok: false; reason: RejectReason; message: string };

export type SubmissionCheck =
  { ok: true; timeMs: number; moveCount: number; usedUndo: boolean } | Rejection;

export type SurvivalCheck =
  { ok: true; survivedMs: number; cleared: number; moveCount: number } | Rejection;

const reject = (reason: RejectReason, message: string): Rejection => ({
  ok: false,
  reason,
  message,
});

/** Undo appends the inverse of the last turn, so any turn immediately reversed counts as undo. */
export function containsUndo(moves: readonly Move[]): boolean {
  return moves.some((move, i) => i > 0 && movesEqual(move, invertMove(moves[i - 1]!)));
}

/** Parses notation and checks timestamps are whole, ordered milliseconds. */
function parseTimed(timed: readonly TimedMoveDto[]): Move[] | Rejection {
  let moves: Move[];
  try {
    moves = timed.map((entry) => parseMove(entry.m));
  } catch (error) {
    if (error instanceof NotationError) return reject('invalid_move', error.message);
    throw error;
  }
  for (let i = 0; i < timed.length; i++) {
    const t = timed[i]!.t;
    if (!Number.isInteger(t) || t < 0 || (i > 0 && t < timed[i - 1]!.t)) {
      return reject('invalid_timestamps', 'Move times must be whole milliseconds, in order.');
    }
  }
  return moves;
}

/** Shared timing rules: no longer than the attempt has existed, no faster than a person. */
function checkTiming(input: SubmissionInput, durationMs: number, moveCount: number) {
  if (durationMs > input.now - input.attemptCreatedAt + RULES.clockSlackMs) {
    return reject('time_mismatch', 'The solve took longer than the attempt has existed.');
  }
  if (moveCount * 1000 > durationMs * RULES.maxTurnsPerSecond) {
    return reject('too_fast', 'Those turns are faster than anyone can make them.');
  }
  return null;
}

export function checkSubmission(input: SubmissionInput): SubmissionCheck {
  const timed = input.moves;
  if (timed.length === 0) return reject('not_solved', 'No moves were submitted.');
  const moves = parseTimed(timed);
  if (!Array.isArray(moves)) return moves;

  if (!verifySolve(input.seed, moves).solved) {
    return reject('not_solved', 'These moves do not solve the scramble.');
  }

  // The clock stops on the final turn.
  const timeMs = timed[timed.length - 1]!.t;
  const moveCount = countMoves(moves);
  if (moveCount < RULES.minMoveCount) {
    return reject('implausible_solution', 'That solution is shorter than a timed solve can be.');
  }
  const timing = checkTiming(input, timeMs, moveCount);
  if (timing) return timing;

  return { ok: true, timeMs, moveCount, usedUndo: input.usedUndo || containsUndo(moves) };
}

/** Replays a survival run; its length comes from the replay, not from the client. */
export function checkSurvival(input: SubmissionInput): SurvivalCheck {
  const moves = parseTimed(input.moves);
  if (!Array.isArray(moves)) return moves;

  const replay = replaySurvival(
    input.seed,
    moves.map((move, i) => ({ move, t: input.moves[i]!.t })),
  );
  if (!replay.valid) return reject('invalid_timestamps', 'Moves were made after the run ended.');

  const moveCount = countMoves(moves);
  const timing = checkTiming(input, replay.survivedMs, moveCount);
  if (timing) return timing;

  return { ok: true, survivedMs: replay.survivedMs, cleared: replay.cleared, moveCount };
}
