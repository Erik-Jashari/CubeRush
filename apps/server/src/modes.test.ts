import type { ChallengeDto, GhostDto, TimedMoveDto } from '@cuberush/api';
import { formatMove, invertMoves, SURVIVAL, waveMoves } from '@cuberush/cube-core';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openDatabase } from './db';
import { solution, useTestServer } from './test-support';

const { call, advance, register, startAttempt, submit } = useTestServer();

describe('blindfold', () => {
  it('gets its own ranked scramble and pays double', async () => {
    const token = await register('Blindy');
    const attempt = await startAttempt(token, 'blindfold');
    expect(attempt).toMatchObject({ mode: 'blindfold', ranked: true });
    expect(attempt.seed).toMatch(/^blind-/);

    const res = await submit(token, attempt);
    expect(res.body.points.modeMultiplier).toBe(2);
  });

  it('pays normally after a peek', async () => {
    const token = await register('Blindy');
    const res = await submit(token, await startAttempt(token, 'blindfold'), undefined, {
      peeked: true,
    });
    expect(res.body.points.modeMultiplier).toBe(1);
  });

  it('peeking means nothing outside blindfold', async () => {
    const token = await register('Speedy');
    const res = await submit(token, await startAttempt(token, 'quick'), undefined, {
      peeked: true,
    });
    expect(res.body.points.modeMultiplier).toBe(1);
  });
});

describe('survival', () => {
  /** Solves wave 0 one second into the run, then lets the clock run out. */
  function clearFirstWave(seed: string): TimedMoveDto[] {
    return invertMoves(waveMoves(seed, 0)).map((move, i) => ({
      m: formatMove(move),
      t: 1000 + i * 400,
    }));
  }

  it('scores waves cleared and reports how long the run lasted', async () => {
    const token = await register('Survivor');
    const attempt = await startAttempt(token, 'survival');
    expect(attempt).toMatchObject({ mode: 'survival', ranked: true });

    const moves = clearFirstWave(attempt.seed);
    const res = await submit(token, attempt, moves);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      survival: { cleared: 1 },
      timeMs: moves.at(-1)!.t + 3 * SURVIVAL.waveMs,
      points: { waves: 150, total: 150 },
    });
  });

  it('accepts an idle run worth no points', async () => {
    const token = await register('Survivor');
    const res = await submit(token, await startAttempt(token, 'survival'), []);
    expect(res.body).toMatchObject({
      survival: { cleared: 0 },
      timeMs: 3 * SURVIVAL.waveMs,
      points: { total: 0 },
    });
  });

  it('rejects a run submitted before it could have ended', async () => {
    const token = await register('Survivor');
    const attempt = await startAttempt(token, 'survival');
    // \`submit\` waits 60 s; a run with a cleared wave lasts longer than that.
    const res = await submit(token, attempt, clearFirstWave(attempt.seed));
    expect(res.status).toBe(201);
    const early = await startAttempt(token, 'survival');
    advance(10_000);
    const tooSoon = await call('POST', '/api/solves', token, {
      attemptId: early.id,
      moves: [],
      usedUndo: false,
    });
    expect(tooSoon).toMatchObject({ status: 422, body: { error: 'time_mismatch' } });
  });

  it('rejects moves made after the run ended', async () => {
    const token = await register('Survivor');
    const attempt = await startAttempt(token, 'survival');
    const late = [{ m: 'R', t: 3 * SURVIVAL.waveMs + 1 }];
    expect(await submit(token, attempt, late)).toMatchObject({ status: 422 });
  });

  it('does not count toward best solve time', async () => {
    const token = await register('Survivor');
    await submit(token, await startAttempt(token, 'survival'), clearFirstWave('x'));
    const attempt = await startAttempt(token, 'survival');
    await submit(token, attempt, clearFirstWave(attempt.seed));
    const board = await call<{ entries: { bestMs: number | null }[] }>(
      'GET',
      '/api/leaderboard/all-time',
    );
    expect(board.body.entries[0]!.bestMs).toBeNull();
  });
});

describe('challenges', () => {
  async function sharedChallenge() {
    const creator = await register('Creator');
    const attempt = await startAttempt(creator, 'quick');
    await submit(creator, attempt, solution(attempt.seed, 300));
    const res = await call<{ code: string }>('POST', '/api/challenges', creator, {
      attemptId: attempt.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-Za-z0-9]{8}$/);
    return { creator, attempt, code: res.body.code };
  }

  it('shares a quick solve, once per solve', async () => {
    const { creator, attempt, code } = await sharedChallenge();
    const again = await call<{ code: string }>('POST', '/api/challenges', creator, {
      attemptId: attempt.id,
    });
    expect(again).toMatchObject({ status: 200, body: { code } });

    const challenge = await call<ChallengeDto>('GET', `/api/challenges/${code}`);
    expect(challenge.body).toMatchObject({
      code,
      seed: attempt.seed,
      creator: 'Creator',
      timeMs: 7200,
      moveCount: 25,
      results: [{ rank: 1, nickname: 'Creator', timeMs: 7200 }],
    });
    expect(challenge.body.moves).toHaveLength(25);
  });

  it('lets friends race on the same scramble, unranked, and ranks their results', async () => {
    const { attempt, code } = await sharedChallenge();
    const friend = await register('Friend');
    const play = await startAttempt(friend, 'challenge', { challenge: code });
    expect(play).toMatchObject({ seed: attempt.seed, ranked: false });

    const res = await submit(friend, play, solution(play.seed, 200));
    expect(res.body.ranked).toBe(false);

    // A retry still counts toward the challenge results.
    const retry = await startAttempt(friend, 'challenge', { retryOf: play.id });
    await submit(friend, retry, solution(play.seed, 150));

    const challenge = await call<ChallengeDto>('GET', `/api/challenges/${code}`);
    expect(challenge.body.results).toEqual([
      { rank: 1, nickname: 'Friend', timeMs: 3600 },
      { rank: 2, nickname: 'Creator', timeMs: 7200 },
    ]);
  });

  it('only shares finished quick-play solves of your own', async () => {
    const owner = await register('Owner');
    const other = await register('Other');

    const unfinished = await startAttempt(owner, 'quick');
    const res1 = await call('POST', '/api/challenges', owner, { attemptId: unfinished.id });
    expect(res1).toMatchObject({ status: 404, body: { error: 'solve_not_found' } });

    const daily = await startAttempt(owner, 'daily');
    await submit(owner, daily);
    const res2 = await call('POST', '/api/challenges', owner, { attemptId: daily.id });
    expect(res2).toMatchObject({ status: 400, body: { error: 'not_shareable' } });

    const quick = await startAttempt(owner, 'quick');
    await submit(owner, quick);
    const res3 = await call('POST', '/api/challenges', other, { attemptId: quick.id });
    expect(res3.status).toBe(404);
  });

  it('answers 404 for unknown challenges', async () => {
    const token = await register('Player');
    expect((await call('GET', '/api/challenges/Abcdefgh')).status).toBe(404);
    expect((await call('GET', '/api/challenges/bad')).status).toBe(404);
    const res = await call('POST', '/api/attempts', token, {
      mode: 'challenge',
      challenge: 'Abcdefgh',
    });
    expect(res).toMatchObject({ status: 404, body: { error: 'challenge_not_found' } });
  });
});

describe('daily ghost', () => {
  it('is only shown after your own ranked attempt', async () => {
    const fast = await register('Fast');
    const late = await register('Late');
    await submit(fast, await startAttempt(fast, 'daily'), solution('daily-2026-10-02', 150));

    expect(await call('GET', '/api/daily/ghost', late)).toMatchObject({
      status: 403,
      body: { error: 'ranked_attempt_first' },
    });

    await startAttempt(late, 'daily');
    const ghost = await call<GhostDto>('GET', '/api/daily/ghost', late);
    expect(ghost.body).toMatchObject({ nickname: 'Fast', timeMs: 3600 });
    expect(ghost.body.moves).toHaveLength(25);
  });

  it('answers 404 before anyone has solved today', async () => {
    const token = await register('Early');
    await startAttempt(token, 'daily');
    expect((await call('GET', '/api/daily/ghost', token)).status).toBe(404);
  });
});

describe('migrations', () => {
  it('moves bought skins into the generalized shop table', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cuberush-'));
    const file = join(dir, 'v3.db');
    try {
      const old = new Database(file);
      for (const sql of MIGRATIONS.slice(0, 3)) old.exec(sql);
      old.pragma('user_version = 3');
      old.exec(`
        INSERT INTO players VALUES ('p1', 'Oldie', 'hash', 1);
        INSERT INTO unlocks VALUES ('p1', 'pastel', 1500, 5);
      `);
      old.close();

      const db = openDatabase(file);
      expect(db.prepare('SELECT * FROM unlocks').all()).toEqual([
        { player_id: 'p1', kind: 'skin', item: 'pastel', cost: 1500, created_at: 5 },
      ]);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('upgrades a version 1 database without losing data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cuberush-'));
    const file = join(dir, 'old.db');
    try {
      const old = new Database(file);
      old.exec(MIGRATIONS[0]!);
      old.pragma('user_version = 1');
      old.exec(`
        INSERT INTO players VALUES ('p1', 'Oldie', 'hash', 1);
        INSERT INTO attempts VALUES ('a1', 'p1', 'quick', 'quick-x', 1, 1, 2);
        INSERT INTO solves (attempt_id, player_id, mode, seed, ranked, moves, time_ms, move_count,
                            used_undo, points, day, created_at)
        VALUES ('a1', 'p1', 'quick', 'quick-x', 1, '[]', 1000, 30, 0, 900, '2026-10-01', 2);
      `);
      old.close();

      const db = openDatabase(file);
      expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
      expect(db.prepare('SELECT * FROM attempts').get()).toMatchObject({
        id: 'a1',
        challenge_code: null,
        submitted_at: 2,
      });
      expect(db.prepare('SELECT points, extra FROM solves').get()).toEqual({
        points: 900,
        extra: null,
      });
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
