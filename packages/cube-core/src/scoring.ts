export const SCORING = {
  /** Time points for an instant solve; halves every `timeHalfPointMs` of solve time. */
  maxTimePoints: 1000,
  timeHalfPointMs: 30_000,
  /** Solves under this many moves earn `pointsPerMoveUnderPar` for each move saved. */
  movePar: 80,
  pointsPerMoveUnderPar: 5,
  noUndoBonus: 100,
  /** Each consecutive day in a streak adds this much to the multiplier, up to `maxStreak` days. */
  streakStep: 0.05,
  maxStreak: 10,
} as const;

export interface PointsInput {
  timeMs: number;
  moveCount: number;
  usedUndo: boolean;
  /** Consecutive days with a solve, default 0. */
  streak?: number;
  /** Set by the game mode (e.g. Blindfold pays more), default 1. */
  modeMultiplier?: number;
}

export interface PointsBreakdown {
  time: number;
  moves: number;
  noUndo: number;
  streakMultiplier: number;
  modeMultiplier: number;
  total: number;
}

/** Shared by client and server so both always agree on a solve's points. */
export function computePoints(input: PointsInput): PointsBreakdown {
  const { timeMs, moveCount, usedUndo, streak = 0, modeMultiplier = 1 } = input;
  if (!Number.isFinite(timeMs) || timeMs < 0) throw new RangeError('timeMs must be >= 0');
  if (!Number.isInteger(moveCount) || moveCount < 0) throw new RangeError('moveCount must be >= 0');
  if (!Number.isInteger(streak) || streak < 0) throw new RangeError('streak must be >= 0');
  if (!Number.isFinite(modeMultiplier) || modeMultiplier <= 0) {
    throw new RangeError('modeMultiplier must be > 0');
  }

  const time = Math.round(
    (SCORING.maxTimePoints * SCORING.timeHalfPointMs) / (timeMs + SCORING.timeHalfPointMs),
  );
  const moves = Math.max(0, SCORING.movePar - moveCount) * SCORING.pointsPerMoveUnderPar;
  const noUndo = usedUndo ? 0 : SCORING.noUndoBonus;
  const streakMultiplier = 1 + Math.min(streak, SCORING.maxStreak) * SCORING.streakStep;
  const total = Math.round((time + moves + noUndo) * streakMultiplier * modeMultiplier);
  return { time, moves, noUndo, streakMultiplier, modeMultiplier, total };
}
