import type {
  AllTimeEntry,
  ChallengeResult,
  DailyEntry,
  GhostDto,
  Mode,
  PlayerDto,
  SkinId,
  StatSolveDto,
  TimedMoveDto,
} from '@cuberush/api';
import type { PlayerFacts } from './achievements.js';
import { longestStreak } from './achievements.js';
import type { Db } from './db.js';

export interface AttemptRow {
  id: string;
  player_id: string;
  mode: Mode;
  seed: string;
  ranked: 0 | 1;
  /** Set for `challenge` attempts (and retries of them). */
  challenge_code: string | null;
  created_at: number;
  submitted_at: number | null;
}

export interface NewSolve {
  attemptId: string;
  playerId: string;
  mode: Mode;
  seed: string;
  ranked: boolean;
  moves: readonly TimedMoveDto[];
  timeMs: number;
  moveCount: number;
  usedUndo: boolean;
  points: number;
  /** Mode-specific details, stored as JSON. */
  extra: Record<string, unknown> | null;
  day: string;
  now: number;
}

export interface ChallengeRow {
  code: string;
  seed: string;
  creator: string;
  time_ms: number;
  move_count: number;
  moves: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** Number of consecutive days ending at `endDay` that appear in `days`. */
export function streakLength(days: ReadonlySet<string>, endDay: string): number {
  let count = 0;
  for (let day = endDay; days.has(day); day = previousDay(day)) count++;
  return count;
}

/** A streak stays alive through today even before today's solve. */
export function currentStreak(days: ReadonlySet<string>, today: string): number {
  return streakLength(days, days.has(today) ? today : previousDay(today));
}

/** Data access. Every query lives here so routes never touch SQL. */
export function createRepo(db: Db) {
  const statements = {
    insertPlayer: db.prepare(
      'INSERT INTO players (id, nickname, token_hash, created_at) VALUES (?, ?, ?, ?)',
    ),
    playerByToken: db.prepare('SELECT id, nickname FROM players WHERE token_hash = ?'),
    insertAttempt: db.prepare(
      `INSERT INTO attempts (id, player_id, mode, seed, ranked, challenge_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    attemptById: db.prepare('SELECT * FROM attempts WHERE id = ?'),
    attemptForSeed: db.prepare('SELECT 1 FROM attempts WHERE player_id = ? AND seed = ? LIMIT 1'),
    markSubmitted: db.prepare(
      'UPDATE attempts SET submitted_at = ? WHERE id = ? AND submitted_at IS NULL',
    ),
    insertSolve: db.prepare(`
      INSERT INTO solves (attempt_id, player_id, mode, seed, ranked, moves, time_ms, move_count,
                          used_undo, points, extra, day, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    solveIdByAttempt: db.prepare('SELECT id, mode FROM solves WHERE attempt_id = ?'),
    challengeBySolve: db.prepare('SELECT code FROM challenges WHERE solve_id = ?'),
    insertChallenge: db.prepare(
      'INSERT INTO challenges (code, solve_id, player_id, created_at) VALUES (?, ?, ?, ?)',
    ),
    challenge: db.prepare(`
      SELECT c.code, s.seed, p.nickname AS creator, s.time_ms, s.move_count, s.moves
      FROM challenges c JOIN solves s ON s.id = c.solve_id JOIN players p ON p.id = s.player_id
      WHERE c.code = ?`),
    challengeResults: db.prepare(`
      SELECT ROW_NUMBER() OVER (ORDER BY best, first_at) AS rank, nickname, best AS time_ms FROM (
        SELECT p.nickname, MIN(s.time_ms) AS best, MIN(s.created_at) AS first_at
        FROM solves s
        JOIN players p ON p.id = s.player_id
        JOIN attempts a ON a.id = s.attempt_id
        WHERE a.challenge_code = @code OR s.id = (SELECT solve_id FROM challenges WHERE code = @code)
        GROUP BY s.player_id
      )
      ORDER BY rank
      LIMIT @limit`),
    dailyTop: db.prepare(`
      SELECT p.nickname, s.time_ms, s.moves FROM solves s JOIN players p ON p.id = s.player_id
      WHERE s.seed = ? AND s.ranked = 1
      ORDER BY s.time_ms, s.move_count, s.created_at
      LIMIT 1`),
    rankedDays: db.prepare('SELECT DISTINCT day FROM solves WHERE player_id = ? AND ranked = 1'),
    totals: db.prepare(
      'SELECT COALESCE(SUM(points), 0) AS points, COUNT(*) AS solves FROM solves WHERE player_id = ? AND ranked = 1',
    ),
    daily: db.prepare(`
      SELECT rank, nickname, time_ms, move_count, points, player_id FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY s.time_ms, s.move_count, s.created_at) AS rank,
               p.nickname, s.time_ms, s.move_count, s.points, s.player_id
        FROM solves s JOIN players p ON p.id = s.player_id
        WHERE s.seed = ? AND s.ranked = 1
      )
      WHERE rank <= ? OR player_id = ?
      ORDER BY rank`),
    allTime: db.prepare(`
      SELECT rank, nickname, points, solves, best_ms, player_id FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY SUM(s.points) DESC, p.created_at) AS rank,
               p.id AS player_id, p.nickname, SUM(s.points) AS points, COUNT(*) AS solves,
               MIN(CASE WHEN s.mode <> 'survival' THEN s.time_ms END) AS best_ms
        FROM solves s JOIN players p ON p.id = s.player_id
        WHERE s.ranked = 1
        GROUP BY p.id
      )
      WHERE rank <= ? OR player_id = ?
      ORDER BY rank`),
    spent: db.prepare('SELECT COALESCE(SUM(cost), 0) AS spent FROM unlocks WHERE player_id = ?'),
    skins: db.prepare('SELECT skin FROM unlocks WHERE player_id = ? ORDER BY created_at'),
    insertUnlock: db.prepare(
      'INSERT INTO unlocks (player_id, skin, cost, created_at) VALUES (?, ?, ?, ?)',
    ),
    solveFacts: db.prepare(`
      SELECT COUNT(*) AS solves,
             MIN(time_ms) AS best_ms,
             MIN(move_count) AS fewest_moves,
             COALESCE(SUM(used_undo = 0), 0) AS without_undo,
             COALESCE(MAX(mode = 'blindfold' AND json_extract(extra, '$.peeked') = 0), 0) AS blind
      FROM solves WHERE player_id = ? AND mode <> 'survival'`),
    mostWaves: db.prepare(`
      SELECT COALESCE(MAX(json_extract(extra, '$.cleared')), 0) AS waves
      FROM solves WHERE player_id = ? AND mode = 'survival'`),
    beatChallenge: db.prepare(`
      SELECT 1 FROM solves s
      JOIN attempts a ON a.id = s.attempt_id
      JOIN challenges c ON c.code = a.challenge_code
      JOIN solves original ON original.id = c.solve_id
      WHERE s.player_id = @player AND original.player_id <> @player AND s.time_ms < original.time_ms
      LIMIT 1`),
    statSolves: db.prepare(`
      SELECT time_ms, move_count, mode, ranked, created_at FROM solves
      WHERE player_id = ? AND mode <> 'survival'
      ORDER BY created_at DESC, id DESC
      LIMIT ?`),
  };

  return {
    /** Throws a SqliteError with code SQLITE_CONSTRAINT_UNIQUE when the nickname is taken. */
    createPlayer(id: string, nickname: string, tokenHash: string, now: number): void {
      statements.insertPlayer.run(id, nickname, tokenHash, now);
    },

    playerByTokenHash(tokenHash: string): PlayerDto | undefined {
      return statements.playerByToken.get(tokenHash) as PlayerDto | undefined;
    },

    createAttempt(attempt: Omit<AttemptRow, 'submitted_at'>): void {
      const { id, player_id, mode, seed, ranked, challenge_code, created_at } = attempt;
      statements.insertAttempt.run(id, player_id, mode, seed, ranked, challenge_code, created_at);
    },

    attempt(id: string): AttemptRow | undefined {
      return statements.attemptById.get(id) as AttemptRow | undefined;
    },

    hasAttemptForSeed(playerId: string, seed: string): boolean {
      return statements.attemptForSeed.get(playerId, seed) !== undefined;
    },

    /** Stores the solve and closes the attempt; returns false if it was already submitted. */
    recordSolve: db.transaction((s: NewSolve): boolean => {
      if (statements.markSubmitted.run(s.now, s.attemptId).changes !== 1) return false;
      statements.insertSolve.run(
        s.attemptId,
        s.playerId,
        s.mode,
        s.seed,
        s.ranked ? 1 : 0,
        JSON.stringify(s.moves),
        s.timeMs,
        s.moveCount,
        s.usedUndo ? 1 : 0,
        s.points,
        s.extra ? JSON.stringify(s.extra) : null,
        s.day,
        s.now,
      );
      return true;
    }),

    solveForAttempt(attemptId: string): { id: number; mode: Mode } | undefined {
      return statements.solveIdByAttempt.get(attemptId) as { id: number; mode: Mode } | undefined;
    },

    challengeCodeForSolve(solveId: number): string | undefined {
      return (statements.challengeBySolve.get(solveId) as { code: string } | undefined)?.code;
    },

    /** Throws SQLITE_CONSTRAINT_PRIMARYKEY if the code is already in use. */
    createChallenge(code: string, solveId: number, playerId: string, now: number): void {
      statements.insertChallenge.run(code, solveId, playerId, now);
    },

    challenge(code: string): ChallengeRow | undefined {
      return statements.challenge.get(code) as ChallengeRow | undefined;
    },

    challengeResults(code: string, limit: number): ChallengeResult[] {
      const rows = statements.challengeResults.all({ code, limit }) as {
        rank: number;
        nickname: string;
        time_ms: number;
      }[];
      return rows.map((r) => ({ rank: r.rank, nickname: r.nickname, timeMs: r.time_ms }));
    },

    /** Points spent on skins; the balance is ranked points earned minus this. */
    spent(playerId: string): number {
      return (statements.spent.get(playerId) as { spent: number }).spent;
    },

    /** Skins the player owns; classic is free for everyone. */
    skins(playerId: string): SkinId[] {
      const rows = statements.skins.all(playerId) as { skin: SkinId }[];
      return ['classic', ...rows.map((r) => r.skin)];
    },

    /** Buys a skin if the player can afford it; the balance check and purchase are atomic. */
    unlock: db.transaction(
      (playerId: string, skin: SkinId, cost: number, now: number): 'ok' | 'owned' | 'poor' => {
        if (statements.skins.all(playerId).some((r) => (r as { skin: string }).skin === skin)) {
          return 'owned';
        }
        const earned = (statements.totals.get(playerId) as { points: number }).points;
        const spent = (statements.spent.get(playerId) as { spent: number }).spent;
        if (earned - spent < cost) return 'poor';
        statements.insertUnlock.run(playerId, skin, cost, now);
        return 'ok';
      },
    ),

    facts(playerId: string): PlayerFacts {
      const solves = statements.solveFacts.get(playerId) as {
        solves: number;
        best_ms: number | null;
        fewest_moves: number | null;
        without_undo: number;
        blind: number;
      };
      const days = (statements.rankedDays.all(playerId) as { day: string }[]).map((r) => r.day);
      return {
        solves: solves.solves,
        bestMs: solves.best_ms,
        fewestMoves: solves.fewest_moves,
        solvesWithoutUndo: solves.without_undo,
        longestStreak: longestStreak(days),
        mostWaves: (statements.mostWaves.get(playerId) as { waves: number }).waves,
        blindWithoutPeek: solves.blind === 1,
        beatAChallenge: statements.beatChallenge.get({ player: playerId }) !== undefined,
        skinsUnlocked: statements.skins.all(playerId).length,
      };
    },

    /** The player's latest solves (no survival runs), oldest first. */
    statSolves(playerId: string, limit: number): StatSolveDto[] {
      const rows = statements.statSolves.all(playerId, limit) as {
        time_ms: number;
        move_count: number;
        mode: Mode;
        ranked: number;
        created_at: number;
      }[];
      return rows.reverse().map((r) => ({
        timeMs: r.time_ms,
        moveCount: r.move_count,
        mode: r.mode,
        ranked: r.ranked === 1,
        at: r.created_at,
      }));
    },

    /** The fastest ranked solve of a daily seed, for racing as a ghost. */
    dailyTop(seed: string): GhostDto | undefined {
      const row = statements.dailyTop.get(seed) as
        { nickname: string; time_ms: number; moves: string } | undefined;
      return (
        row && {
          nickname: row.nickname,
          timeMs: row.time_ms,
          moves: JSON.parse(row.moves) as TimedMoveDto[],
        }
      );
    },

    rankedDays(playerId: string): Set<string> {
      const rows = statements.rankedDays.all(playerId) as { day: string }[];
      return new Set(rows.map((r) => r.day));
    },

    totals(playerId: string): { points: number; solves: number } {
      return statements.totals.get(playerId) as { points: number; solves: number };
    },

    /** Top `limit` ranked solves of a daily seed, plus the given player's own entry. */
    dailyLeaderboard(seed: string, limit: number, playerId: string | null) {
      type Row = {
        rank: number;
        nickname: string;
        time_ms: number;
        move_count: number;
        points: number;
        player_id: string;
      };
      const rows = statements.daily.all(seed, limit, playerId) as Row[];
      const toEntry = (r: Row): DailyEntry => ({
        rank: r.rank,
        nickname: r.nickname,
        timeMs: r.time_ms,
        moveCount: r.move_count,
        points: r.points,
      });
      const mine = rows.find((r) => r.player_id === playerId);
      return {
        entries: rows.filter((r) => r.rank <= limit).map(toEntry),
        me: mine ? toEntry(mine) : null,
      };
    },

    /** Players ranked by total ranked points, plus the given player's own entry. */
    allTimeLeaderboard(limit: number, playerId: string | null) {
      type Row = {
        rank: number;
        nickname: string;
        points: number;
        solves: number;
        best_ms: number | null;
        player_id: string;
      };
      const rows = statements.allTime.all(limit, playerId) as Row[];
      const toEntry = (r: Row): AllTimeEntry => ({
        rank: r.rank,
        nickname: r.nickname,
        points: r.points,
        solves: r.solves,
        bestMs: r.best_ms,
      });
      const mine = rows.find((r) => r.player_id === playerId);
      return {
        entries: rows.filter((r) => r.rank <= limit).map(toEntry),
        me: mine ? toEntry(mine) : null,
      };
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
