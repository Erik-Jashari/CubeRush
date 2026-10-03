import type {
  AllTimeEntry,
  ChallengeResult,
  DailyEntry,
  FastestEntry,
  GhostDto,
  LessonId,
  Mode,
  PlayerDto,
  ShopKind,
  SkinId,
  StatSolveDto,
  ThemeId,
  TimedMoveDto,
} from '@cuberush/api';
import { currentAverage } from '@cuberush/cube-core';
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
/** Sessions record when they were last used, but at most this often, to avoid a write per request. */
const SESSION_TOUCH_MS = 60 * 60 * 1000;
/** Modes whose times are comparable on the Fastest board. */
const TIMED_MODES = `('quick', 'daily')`;

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
    insertPlayer: db.prepare('INSERT INTO players (id, nickname, created_at) VALUES (?, ?, ?)'),
    insertSession: db.prepare(
      'INSERT INTO sessions (token_hash, player_id, created_at, last_used_at) VALUES (?, ?, ?, ?)',
    ),
    playerByToken: db.prepare(`
      SELECT p.id, p.nickname FROM sessions s JOIN players p ON p.id = s.player_id
      WHERE s.token_hash = ?`),
    touchSession: db.prepare(
      'UPDATE sessions SET last_used_at = @now WHERE token_hash = @hash AND last_used_at < @before',
    ),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteOtherSessions: db.prepare(
      'DELETE FROM sessions WHERE player_id = @player AND token_hash <> @hash',
    ),
    otherSessions: db.prepare(
      'SELECT COUNT(*) AS n FROM sessions WHERE player_id = @player AND token_hash <> @hash',
    ),
    setLoginHash: db.prepare('UPDATE players SET login_hash = ? WHERE id = ?'),
    playerByLogin: db.prepare('SELECT id, nickname FROM players WHERE login_hash = ?'),
    hasLogin: db.prepare('SELECT login_hash IS NOT NULL AS has FROM players WHERE id = ?'),
    lessons: db.prepare(
      'SELECT lesson_id FROM lesson_progress WHERE player_id = ? ORDER BY done_at, lesson_id',
    ),
    insertLesson: db.prepare(
      'INSERT OR IGNORE INTO lesson_progress (player_id, lesson_id, done_at) VALUES (?, ?, ?)',
    ),
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
        WHERE s.ranked = 1 AND s.created_at >= @since
        GROUP BY p.id
      )
      WHERE rank <= @limit OR player_id = @player
      ORDER BY rank`),
    // With MIN(), SQLite takes the bare columns (move_count, created_at) from the best row.
    fastest: db.prepare(`
      SELECT rank, nickname, best_ms, move_count, player_id FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY b.best_ms, b.set_at) AS rank,
               p.nickname, b.best_ms, b.move_count, b.player_id
        FROM (
          SELECT player_id, MIN(time_ms) AS best_ms, move_count, created_at AS set_at
          FROM solves WHERE ranked = 1 AND mode IN ${TIMED_MODES}
          GROUP BY player_id
        ) b JOIN players p ON p.id = b.player_id
      )
      WHERE rank <= @limit OR player_id = @player
      ORDER BY rank`),
    recentTimes: db.prepare(`
      SELECT time_ms FROM solves WHERE player_id = ? AND ranked = 1 AND mode IN ${TIMED_MODES}
      ORDER BY created_at DESC, id DESC
      LIMIT ?`),
    spent: db.prepare('SELECT COALESCE(SUM(cost), 0) AS spent FROM unlocks WHERE player_id = ?'),
    owned: db.prepare(
      'SELECT item FROM unlocks WHERE player_id = ? AND kind = ? ORDER BY created_at',
    ),
    unlockCount: db.prepare('SELECT COUNT(*) AS n FROM unlocks WHERE player_id = ?'),
    insertUnlock: db.prepare(
      'INSERT INTO unlocks (player_id, kind, item, cost, created_at) VALUES (?, ?, ?, ?, ?)',
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
    /**
     * Creates a player signed in on this device. Throws a SqliteError with code
     * SQLITE_CONSTRAINT_UNIQUE when the nickname is taken.
     */
    createPlayer: db.transaction((id: string, nickname: string, tokenHash: string, now: number) => {
      statements.insertPlayer.run(id, nickname, now);
      statements.insertSession.run(tokenHash, id, now, now);
    }),

    /** The player a session token belongs to; also notes that the session is still in use. */
    playerByTokenHash(tokenHash: string, now: number): PlayerDto | undefined {
      const player = statements.playerByToken.get(tokenHash) as PlayerDto | undefined;
      if (player) {
        statements.touchSession.run({ now, hash: tokenHash, before: now - SESSION_TOUCH_MS });
      }
      return player;
    },

    createSession(tokenHash: string, playerId: string, now: number): void {
      statements.insertSession.run(tokenHash, playerId, now, now);
    },

    deleteSession(tokenHash: string): void {
      statements.deleteSession.run(tokenHash);
    },

    /** Signs out every device but the one holding `tokenHash`; returns how many were removed. */
    deleteOtherSessions(playerId: string, tokenHash: string): number {
      return statements.deleteOtherSessions.run({ player: playerId, hash: tokenHash }).changes;
    },

    otherSessions(playerId: string, tokenHash: string): number {
      const row = statements.otherSessions.get({ player: playerId, hash: tokenHash });
      return (row as { n: number }).n;
    },

    /** Replaces the player's login code; only its hash is kept. */
    setLoginHash(playerId: string, loginHash: string): void {
      statements.setLoginHash.run(loginHash, playerId);
    },

    playerByLoginHash(loginHash: string): PlayerDto | undefined {
      return statements.playerByLogin.get(loginHash) as PlayerDto | undefined;
    },

    hasLoginCode(playerId: string): boolean {
      return (statements.hasLogin.get(playerId) as { has: number }).has === 1;
    },

    lessons(playerId: string): LessonId[] {
      const rows = statements.lessons.all(playerId) as { lesson_id: LessonId }[];
      return rows.map((r) => r.lesson_id);
    },

    /** Records finished lessons; ones already recorded keep their first date. */
    addLessons: db.transaction((playerId: string, ids: readonly LessonId[], now: number) => {
      for (const id of ids) statements.insertLesson.run(playerId, id, now);
    }),

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

    /** Points spent in the shop; the balance is ranked points earned minus this. */
    spent(playerId: string): number {
      return (statements.spent.get(playerId) as { spent: number }).spent;
    },

    /** Items of one kind the player bought (free items are not stored). */
    bought(playerId: string, kind: ShopKind): string[] {
      return (statements.owned.all(playerId, kind) as { item: string }[]).map((r) => r.item);
    },

    /** Skins the player owns; classic is free for everyone. */
    skins(playerId: string): SkinId[] {
      return ['classic', ...(this.bought(playerId, 'skin') as SkinId[])];
    },

    /** Themes the player owns; the free ones belong to everyone. */
    themes(playerId: string, free: readonly ThemeId[]): ThemeId[] {
      return [...free, ...(this.bought(playerId, 'theme') as ThemeId[])];
    },

    /** Buys an item if the player can afford it; the balance check and purchase are atomic. */
    unlock: db.transaction(
      (
        playerId: string,
        kind: ShopKind,
        item: string,
        cost: number,
        now: number,
      ): 'ok' | 'owned' | 'poor' => {
        const owned = statements.owned.all(playerId, kind) as { item: string }[];
        if (owned.some((r) => r.item === item)) return 'owned';
        const earned = (statements.totals.get(playerId) as { points: number }).points;
        const spent = (statements.spent.get(playerId) as { spent: number }).spent;
        if (earned - spent < cost) return 'poor';
        statements.insertUnlock.run(playerId, kind, item, cost, now);
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
        unlocks: (statements.unlockCount.get(playerId) as { n: number }).n,
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

    /**
     * Players ranked by points from ranked solves since `since` (epoch ms; 0 for all time), plus
     * the given player's own entry.
     */
    pointsLeaderboard(limit: number, playerId: string | null, since = 0) {
      type Row = {
        rank: number;
        nickname: string;
        points: number;
        solves: number;
        best_ms: number | null;
        player_id: string;
      };
      const rows = statements.allTime.all({ limit, player: playerId, since }) as Row[];
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

    /** Players ranked by their best ranked Quick/Daily single, plus the given player's own entry. */
    fastestLeaderboard(limit: number, playerId: string | null) {
      type Row = {
        rank: number;
        nickname: string;
        best_ms: number;
        move_count: number;
        player_id: string;
      };
      const rows = statements.fastest.all({ limit, player: playerId }) as Row[];
      const toEntry = (r: Row): FastestEntry => {
        const recent = statements.recentTimes.all(r.player_id, 5) as { time_ms: number }[];
        return {
          rank: r.rank,
          nickname: r.nickname,
          bestMs: r.best_ms,
          moveCount: r.move_count,
          ao5Ms: currentAverage(recent.map((t) => t.time_ms).reverse(), 5),
        };
      };
      const mine = rows.find((r) => r.player_id === playerId);
      return {
        entries: rows.filter((r) => r.rank <= limit).map(toEntry),
        me: mine ? toEntry(mine) : null,
      };
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
