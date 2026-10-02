import type {
  AllTimeLeaderboard,
  DailyLeaderboard,
  MeResponse,
  RegisterResponse,
} from '@cuberush/api';
import { describe, expect, it } from 'vitest';
import { RULES } from './anticheat';
import { buildApp } from './app';
import { openDatabase } from './db';
import { DAY_MS, solution, useTestServer } from './test-support';

const { call, advance, register, startAttempt, submit } = useTestServer();

describe('players', () => {
  it('registers a nickname and returns a token', async () => {
    const res = await call<RegisterResponse>('POST', '/api/players', undefined, {
      nickname: '  Speedy_1 ',
    });
    expect(res.status).toBe(201);
    expect(res.body.player.nickname).toBe('Speedy_1');
    expect(res.body.token.length).toBeGreaterThan(30);
  });

  it('rejects taken nicknames regardless of case', async () => {
    await register('Speedy');
    const res = await call('POST', '/api/players', undefined, { nickname: 'speedy' });
    expect(res).toMatchObject({ status: 409, body: { error: 'nickname_taken' } });
  });

  it('rejects invalid nicknames and malformed bodies', async () => {
    for (const nickname of ['ab', 'has space', 'x'.repeat(21), 'emoji🙂']) {
      const res = await call('POST', '/api/players', undefined, { nickname });
      expect(res).toMatchObject({ status: 400, body: { error: 'invalid_nickname' } });
    }
    const res = await call('POST', '/api/players', undefined, { name: 'Speedy' });
    expect(res).toMatchObject({ status: 400, body: { error: 'bad_request' } });
  });

  it('requires a valid token', async () => {
    expect((await call('GET', '/api/me')).status).toBe(401);
    expect((await call('GET', '/api/me', 'not-a-token')).status).toBe(401);
    const token = await register('Speedy');
    const me = await call<MeResponse>('GET', '/api/me', token);
    expect(me.body).toMatchObject({ player: { nickname: 'Speedy' }, totalPoints: 0, solves: 0 });
  });
});

describe('solves', () => {
  it('verifies and scores a quick solve', async () => {
    const token = await register('Speedy');
    const attempt = await startAttempt(token, 'quick');
    expect(attempt).toMatchObject({ mode: 'quick', ranked: true });
    expect(attempt.seed).toMatch(/^quick-/);

    const res = await submit(token, attempt);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ timeMs: 4800, moveCount: 25, ranked: true, streak: 1 });
    expect(res.body.points.total).toBeGreaterThan(0);

    const me = await call<MeResponse>('GET', '/api/me', token);
    expect(me.body).toMatchObject({ totalPoints: res.body.points.total, solves: 1, streak: 1 });
  });

  it('gives each quick attempt a fresh scramble', async () => {
    const token = await register('Speedy');
    const a = await startAttempt(token, 'quick');
    const b = await startAttempt(token, 'quick');
    expect(a.seed).not.toBe(b.seed);
  });

  it('accepts each attempt only once', async () => {
    const token = await register('Speedy');
    const attempt = await startAttempt(token, 'quick');
    expect((await submit(token, attempt)).status).toBe(201);
    expect(await submit(token, attempt)).toMatchObject({
      status: 409,
      body: { error: 'already_submitted' },
    });
  });

  it('rejects tampered solves', async () => {
    const token = await register('Speedy');
    const attempt = await startAttempt(token, 'quick');
    const real = solution(attempt.seed);

    const unsolved = await submit(token, attempt, real.slice(0, -2));
    expect(unsolved).toMatchObject({ status: 422, body: { error: 'not_solved' } });

    const instant = await submit(
      token,
      attempt,
      real.map((e) => ({ ...e, t: 0 })),
    );
    expect(instant).toMatchObject({ status: 422, body: { error: 'too_fast' } });

    const tooLong = await submit(
      token,
      attempt,
      real.map((e) => ({ ...e, t: e.t * 1000 })),
    );
    expect(tooLong).toMatchObject({ status: 422, body: { error: 'time_mismatch' } });

    // Rejections don't burn the attempt.
    expect((await submit(token, attempt)).status).toBe(201);
  });

  it('rejects malformed move lists', async () => {
    const token = await register('Speedy');
    const attempt = await startAttempt(token, 'quick');
    const res = await call('POST', '/api/solves', token, {
      attemptId: attempt.id,
      moves: [{ m: 'R', t: -1 }],
      usedUndo: false,
    });
    expect(res).toMatchObject({ status: 400, body: { error: 'bad_request' } });
  });

  it("does not accept another player's attempt", async () => {
    const owner = await register('Owner');
    const thief = await register('Thief');
    const attempt = await startAttempt(owner, 'quick');
    expect(await submit(thief, attempt)).toMatchObject({
      status: 404,
      body: { error: 'attempt_not_found' },
    });
  });

  it('expires old attempts', async () => {
    const token = await register('Speedy');
    const attempt = await startAttempt(token, 'quick');
    advance(RULES.attemptTtlMs);
    expect(await submit(token, attempt)).toMatchObject({
      status: 410,
      body: { error: 'attempt_expired' },
    });
  });

  it('notices undo even when the client does not report it', async () => {
    const token = await register('Speedy');
    const attempt = await startAttempt(token, 'quick');
    const [first, ...rest] = solution(attempt.seed);
    const moves = [
      first!,
      { m: 'U', t: 100 },
      { m: "U'", t: 150 },
      ...rest.map((e) => ({ ...e, t: e.t + 150 })),
    ];
    const res = await submit(token, attempt, moves);
    expect(res.body).toMatchObject({ usedUndo: true, points: { noUndo: 0 } });
  });

  it('retries replay the scramble but never count', async () => {
    const token = await register('Speedy');
    const attempt = await startAttempt(token, 'quick');
    const retry = await startAttempt(token, 'quick', { retryOf: attempt.id });
    expect(retry).toMatchObject({ seed: attempt.seed, ranked: false });

    const res = await submit(token, retry);
    expect(res.body.ranked).toBe(false);
    const me = await call<MeResponse>('GET', '/api/me', token);
    expect(me.body).toMatchObject({ totalPoints: 0, solves: 0 });
  });

  it("can't retry someone else's attempt", async () => {
    const owner = await register('Owner');
    const other = await register('Other');
    const attempt = await startAttempt(owner, 'quick');
    const res = await call('POST', '/api/attempts', other, { mode: 'quick', retryOf: attempt.id });
    expect(res.status).toBe(404);
  });

  it('grows the streak and its bonus on consecutive days', async () => {
    const token = await register('Speedy');
    const day1 = await submit(token, await startAttempt(token, 'quick'));
    advance(DAY_MS);
    const day2 = await submit(token, await startAttempt(token, 'quick'));
    expect(day1.body).toMatchObject({ streak: 1, points: { streakMultiplier: 1 } });
    expect(day2.body).toMatchObject({ streak: 2, points: { streakMultiplier: 1.05 } });

    advance(3 * DAY_MS);
    const me = await call<MeResponse>('GET', '/api/me', token);
    expect(me.body.streak).toBe(0);
  });
});

describe('daily scramble', () => {
  it('gives everyone the same scramble and only ranks the first attempt', async () => {
    const alice = await register('Alice');
    const bob = await register('Bob');
    const a1 = await startAttempt(alice, 'daily');
    const a2 = await startAttempt(alice, 'daily');
    const b1 = await startAttempt(bob, 'daily');

    expect(a1).toMatchObject({ seed: 'daily-2026-10-02', ranked: true });
    expect(a2).toMatchObject({ seed: 'daily-2026-10-02', ranked: false });
    expect(b1).toMatchObject({ seed: 'daily-2026-10-02', ranked: true });

    const me = await call<MeResponse>('GET', '/api/me', alice);
    expect(me.body.daily).toMatchObject({ date: '2026-10-02', rankedAvailable: false });
  });

  it('ranks the daily leaderboard by time', async () => {
    const alice = await register('Alice');
    const bob = await register('Bob');
    const carol = await register('Carol');
    const seed = 'daily-2026-10-02';

    await submit(alice, await startAttempt(alice, 'daily'), solution(seed, 300));
    const bobRes = await submit(bob, await startAttempt(bob, 'daily'), solution(seed, 150));
    expect(bobRes.body.dailyRank).toBe(1);
    // Carol's practice run is fast but unranked, so it stays off the board.
    await startAttempt(carol, 'daily');
    await submit(carol, await startAttempt(carol, 'daily'), solution(seed, 100));

    const board = await call<DailyLeaderboard>('GET', '/api/leaderboard/daily', alice);
    expect(board.body.date).toBe('2026-10-02');
    expect(board.body.entries.map((e) => [e.rank, e.nickname, e.timeMs])).toEqual([
      [1, 'Bob', 3600],
      [2, 'Alice', 7200],
    ]);
    expect(board.body.me).toMatchObject({ rank: 2, nickname: 'Alice' });
  });

  it("includes the player's own entry when it is outside the top", async () => {
    const tokens = [];
    for (const name of ['Pat1', 'Pat2', 'Pat3']) tokens.push(await register(name));
    const seed = 'daily-2026-10-02';
    for (const [i, token] of tokens.entries()) {
      await submit(token, await startAttempt(token, 'daily'), solution(seed, 150 + i * 50));
    }
    const board = await call<DailyLeaderboard>('GET', '/api/leaderboard/daily?limit=1', tokens[2]);
    expect(board.body.entries.map((e) => e.nickname)).toEqual(['Pat1']);
    expect(board.body.me).toMatchObject({ rank: 3, nickname: 'Pat3' });
  });

  it('serves past days and validates the date', async () => {
    const old = await call<DailyLeaderboard>('GET', '/api/leaderboard/daily?date=2026-09-01');
    expect(old.body).toEqual({ date: '2026-09-01', entries: [], me: null });
    expect((await call('GET', '/api/leaderboard/daily?date=yesterday')).status).toBe(400);
  });
});

describe('all-time leaderboard', () => {
  it('ranks players by total ranked points', async () => {
    const alice = await register('Alice');
    const bob = await register('Bob');
    await submit(alice, await startAttempt(alice, 'quick'));
    await submit(bob, await startAttempt(bob, 'quick'));
    await submit(bob, await startAttempt(bob, 'quick'));

    const board = await call<AllTimeLeaderboard>('GET', '/api/leaderboard/all-time', alice);
    expect(board.body.entries.map((e) => [e.rank, e.nickname, e.solves])).toEqual([
      [1, 'Bob', 2],
      [2, 'Alice', 1],
    ]);
    expect(board.body.entries[0]!.points).toBeGreaterThan(board.body.entries[1]!.points);
    expect(board.body.me).toMatchObject({ rank: 2, nickname: 'Alice', bestMs: 4800 });
  });
});

describe('http', () => {
  it('answers unknown API routes with JSON 404', async () => {
    expect(await call('GET', '/api/nope')).toMatchObject({
      status: 404,
      body: { error: 'not_found' },
    });
  });

  it('rate-limits sign-ups per IP', async () => {
    const limited = await buildApp({ db: openDatabase(':memory:') });
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const res = await limited.inject({
        method: 'POST',
        url: '/api/players',
        payload: { nickname: `player${i}` },
      });
      statuses.push(res.statusCode);
    }
    await limited.close();
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });
});
