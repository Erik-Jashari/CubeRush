import type { ModeId, PointsBreakdown } from '@cuberush/cube-core';

/** 3–20 letters, digits, `_` or `-`. Uniqueness is case-insensitive. */
export const NICKNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
export const NICKNAME_RULES = '3–20 characters: letters, numbers, _ or -';

/** Longest move list a solve may submit. */
export const MAX_SOLVE_MOVES = 1000;

export type Mode = ModeId;

/** Share links look like `/c/<code>`. */
export const CHALLENGE_CODE_PATTERN = /^[A-Za-z0-9]{8}$/;

export function challengePath(code: string): string {
  return `/c/${code}`;
}

/** Today's UTC date as `YYYY-MM-DD`, the key for the daily scramble. */
export function utcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Everyone gets the same daily scramble because everyone uses the same seed. */
export function dailySeed(date: string): string {
  return `daily-${date}`;
}

/** Every error response has this shape; `error` is a stable code, `message` is for people. */
export interface ApiErrorBody {
  error: string;
  message: string;
}

export interface PlayerDto {
  id: string;
  nickname: string;
}

// POST /api/players
export interface RegisterRequest {
  nickname: string;
}
export interface RegisterResponse {
  player: PlayerDto;
  /** Secret that identifies the player from now on; sent as `Authorization: Bearer <token>`. */
  token: string;
}

// GET /api/me
export interface MeResponse {
  player: PlayerDto;
  totalPoints: number;
  wallet: WalletDto;
  /** Skins this player owns (always includes classic). */
  skins: SkinId[];
  solves: number;
  /** Consecutive UTC days, up to today or yesterday, with at least one ranked solve. */
  streak: number;
  daily: {
    date: string;
    /** True until the player starts today's daily scramble. */
    rankedAvailable: boolean;
    entry: DailyEntry | null;
  };
}

// POST /api/attempts
export interface CreateAttemptRequest {
  mode: Mode;
  /** Replays the scramble of an earlier attempt; retries never count for points. */
  retryOf?: string;
  /** Required for `challenge` mode: the challenge code from the share link. */
  challenge?: string;
}
export interface AttemptDto {
  id: string;
  mode: Mode;
  seed: string;
  /** Whether a solve of this attempt counts for points and leaderboards. */
  ranked: boolean;
}

// POST /api/solves
export interface TimedMoveDto {
  /** Move in WCA notation. */
  m: string;
  /** Milliseconds since the timer started. */
  t: number;
}
export interface SubmitSolveRequest {
  attemptId: string;
  moves: TimedMoveDto[];
  usedUndo: boolean;
  /** Blindfold only: the player revealed the stickers, so no blindfold bonus. */
  peeked?: boolean;
}
export interface SolveDto {
  /** Solve time, or for survival how long the run lasted. */
  timeMs: number;
  moveCount: number;
  usedUndo: boolean;
  ranked: boolean;
  /** Computed by the server; only added to the player's total when `ranked`. */
  points: PointsBreakdown;
  /** Position on today's daily leaderboard, for ranked daily solves. */
  dailyRank: number | null;
  streak: number;
  /** Survival only. */
  survival: { cleared: number } | null;
  /** Achievements this solve unlocked. */
  newAchievements: AchievementId[];
}

// GET /api/leaderboard/daily?date=YYYY-MM-DD
export interface DailyEntry {
  rank: number;
  nickname: string;
  timeMs: number;
  moveCount: number;
  points: number;
}
export interface DailyLeaderboard {
  date: string;
  entries: DailyEntry[];
  /** The signed-in player's entry, even when it is outside `entries`. */
  me: DailyEntry | null;
}

// GET /api/leaderboard/all-time
export interface AllTimeEntry {
  rank: number;
  nickname: string;
  points: number;
  solves: number;
  /** Fastest single solve; null if the player has only played survival. */
  bestMs: number | null;
}
export interface AllTimeLeaderboard {
  entries: AllTimeEntry[];
  me: AllTimeEntry | null;
}

// POST /api/challenges
export interface CreateChallengeRequest {
  /** A finished quick-play attempt of the signed-in player. */
  attemptId: string;
}

/** Best time per player on a challenge, the creator included. */
export interface ChallengeResult {
  rank: number;
  nickname: string;
  timeMs: number;
}

// GET /api/challenges/:code
export interface ChallengeDto {
  code: string;
  seed: string;
  creator: string;
  timeMs: number;
  moveCount: number;
  /** The creator's solve, for racing their ghost. */
  moves: TimedMoveDto[];
  results: ChallengeResult[];
}

/** A recorded solve to race against. */
export interface GhostDto {
  nickname: string;
  timeMs: number;
  moves: TimedMoveDto[];
}

// ---- Progression ----

export type SkinId = 'classic' | 'pastel' | 'neon' | 'wood';

/** Cube looks bought with points. Spending never lowers a player's leaderboard total. */
export const SKINS: readonly { id: SkinId; name: string; cost: number }[] = [
  { id: 'classic', name: 'Classic', cost: 0 },
  { id: 'pastel', name: 'Pastel', cost: 1500 },
  { id: 'neon', name: 'Neon', cost: 3000 },
  { id: 'wood', name: 'Wood', cost: 5000 },
];

export interface WalletDto {
  /** All points from ranked solves (the leaderboard total). */
  earned: number;
  spent: number;
  balance: number;
}

// POST /api/unlocks
export interface UnlockRequest {
  skin: SkinId;
}
export interface UnlockResponse {
  wallet: WalletDto;
  skins: SkinId[];
}

export type AchievementId =
  | 'first-solve'
  | 'sub-60'
  | 'sub-30'
  | 'efficient'
  | 'clean-10'
  | 'streak-3'
  | 'streak-10'
  | 'survivor'
  | 'blind'
  | 'challenger'
  | 'collector';

/** `target` is set for achievements earned by counting something (days, waves, solves). */
export const ACHIEVEMENTS: readonly {
  id: AchievementId;
  name: string;
  description: string;
  target?: number;
}[] = [
  { id: 'first-solve', name: 'First solve', description: 'Solve a scramble.' },
  { id: 'sub-60', name: 'Sub-60', description: 'Solve in under a minute.' },
  { id: 'sub-30', name: 'Sub-30', description: 'Solve in under 30 seconds.' },
  { id: 'efficient', name: 'Efficient', description: 'Solve in 50 moves or fewer.' },
  { id: 'clean-10', name: 'Clean hands', description: 'Solve 10 times without undo.', target: 10 },
  { id: 'streak-3', name: 'On a roll', description: 'Play 3 days in a row.', target: 3 },
  { id: 'streak-10', name: '10 days in a row', description: 'Play 10 days in a row.', target: 10 },
  {
    id: 'survivor',
    name: 'Survivor',
    description: 'Solve 5 waves in one survival run.',
    target: 5,
  },
  { id: 'blind', name: 'Eyes closed', description: 'Finish a blindfold solve without peeking.' },
  { id: 'challenger', name: 'Challenger', description: 'Beat a friend’s challenge time.' },
  { id: 'collector', name: 'Collector', description: 'Unlock a skin.' },
];

// GET /api/me/achievements
export interface AchievementDto {
  id: AchievementId;
  unlocked: boolean;
  /** Progress toward `target`, for counted achievements. */
  progress: number | null;
}

// GET /api/me/stats
export interface StatSolveDto {
  timeMs: number;
  moveCount: number;
  mode: Mode;
  ranked: boolean;
  /** When the solve was submitted (epoch ms). */
  at: number;
}
export interface StatsResponse {
  /** Up to the latest 500 solves (survival runs excluded), oldest first. */
  solves: StatSolveDto[];
}
