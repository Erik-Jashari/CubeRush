import {
  utcWeekStart,
  type AllTimeLeaderboard,
  type FastestLeaderboard,
  type LessonsResponse,
  type LoginCodeResponse,
  type MeResponse,
  type RegisterResponse,
  type WeeklyLeaderboard,
} from '@cuberush/api';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp, hashToken } from './app';
import { MIGRATIONS, openDatabase } from './db';
import { DAY_MS, solution, useTestServer } from './test-support';

const server = useTestServer();
const { call } = server;

describe('login codes and devices', () => {
  it('signs a second device in with a login code', async () => {
    const first = await server.register('Twin');
    expect((await call<MeResponse>('GET', '/api/me', first)).body.hasLoginCode).toBe(false);

    const { status, body } = await call<LoginCodeResponse>('POST', '/api/me/login-code', first);
    expect(status).toBe(201);
    expect(body.code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);

    // Typed sloppily on the other device: lowercase, spaces instead of dashes.
    const typed = body.code.toLowerCase().replaceAll('-', ' ');
    const login = await call<RegisterResponse>('POST', '/api/login', undefined, { code: typed });
    expect(login.status).toBe(201);
    expect(login.body.player.nickname).toBe('Twin');
    const second = login.body.token;
    expect(second).not.toBe(first);

    const me = (await call<MeResponse>('GET', '/api/me', second)).body;
    expect(me.player.nickname).toBe('Twin');
    expect(me.hasLoginCode).toBe(true);
    expect(me.otherSessions).toBe(1);
  });

  it('a new code replaces the old one', async () => {
    const token = await server.register('Rotator');
    const old = (await call<LoginCodeResponse>('POST', '/api/me/login-code', token)).body.code;
    const fresh = (await call<LoginCodeResponse>('POST', '/api/me/login-code', token)).body.code;
    expect((await call('POST', '/api/login', undefined, { code: old })).status).toBe(401);
    expect((await call('POST', '/api/login', undefined, { code: fresh })).status).toBe(201);
  });

  it('rejects codes that match nobody', async () => {
    for (const code of ['', 'ABCD', 'ABCD-EFGH-JKLM-NPQR']) {
      const res = await call<{ error: string }>('POST', '/api/login', undefined, { code });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('bad_code');
    }
  });

  it('signs other devices out, or just this one', async () => {
    const first = await server.register('Careful');
    const { code } = (await call<LoginCodeResponse>('POST', '/api/me/login-code', first)).body;
    const second = (await call<RegisterResponse>('POST', '/api/login', undefined, { code })).body
      .token;

    const res = await call<{ signedOut: number }>('POST', '/api/me/logout-others', second);
    expect(res.body.signedOut).toBe(1);
    expect((await call('GET', '/api/me', first)).status).toBe(401);
    expect((await call('GET', '/api/me', second)).status).toBe(200);

    expect((await call('POST', '/api/me/logout', second)).status).toBe(204);
    expect((await call('GET', '/api/me', second)).status).toBe(401);
    // The code still works to come back.
    expect((await call('POST', '/api/login', undefined, { code })).status).toBe(201);
  });

  it('keeps existing players signed in through the upgrade', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cuberush-'));
    const file = join(dir, 'v4.db');
    try {
      const old = new Database(file);
      for (const sql of MIGRATIONS.slice(0, 4)) old.exec(sql);
      old.pragma('user_version = 4');
      old
        .prepare('INSERT INTO players VALUES (?, ?, ?, ?)')
        .run('p1', 'Oldie', hashToken('old-token'), 1);
      old.close();

      const db = openDatabase(file);
      const app = await buildApp({ db, rateLimit: false });
      const res = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { authorization: 'Bearer old-token' },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as MeResponse).player.nickname).toBe('Oldie');
      await app.close();
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('nicknames', () => {
  it('refuses offensive and official-looking names', async () => {
    for (const nickname of ['fuckface', 'Admin', 'cuberush_team']) {
      const res = await call<{ error: string }>('POST', '/api/players', undefined, { nickname });
      expect(res.status, nickname).toBe(400);
      expect(res.body.error).toBe('invalid_nickname');
    }
  });
});

describe('lesson progress', () => {
  it('merges finished lessons from every device', async () => {
    const token = await server.register('Learner');
    let res = await call<LessonsResponse>('POST', '/api/me/lessons', token, {
      ids: ['faces', 'sexy'],
    });
    expect(res.body.lessons).toEqual(['faces', 'sexy']);
    res = await call<LessonsResponse>('POST', '/api/me/lessons', token, {
      ids: ['faces', 'cross'],
    });
    expect(res.body.lessons.sort()).toEqual(['cross', 'faces', 'sexy']);
    expect((await call<MeResponse>('GET', '/api/me', token)).body.lessons).toHaveLength(3);
  });

  it('rejects unknown lessons', async () => {
    const token = await server.register('Typo');
    const res = await call('POST', '/api/me/lessons', token, { ids: ['flying'] });
    expect(res.status).toBe(400);
  });
});

describe('weekly and fastest leaderboards', () => {
  it('weeks start on Monday, UTC', () => {
    expect(utcWeekStart(new Date('2026-10-02T12:00:00Z'))).toBe('2026-09-28'); // Friday
    expect(utcWeekStart(new Date('2026-10-04T23:59:59Z'))).toBe('2026-09-28'); // Sunday
    expect(utcWeekStart(new Date('2026-10-05T00:00:00Z'))).toBe('2026-10-05'); // Monday
  });

  it('only counts this week’s points on the weekly board', async () => {
    const old = await server.register('LastWeek');
    await server.submit(old, await server.startAttempt(old, 'quick'));
    server.advance(4 * DAY_MS); // Friday noon → past Monday 00:00

    const fresh = await server.register('ThisWeek');
    await server.submit(fresh, await server.startAttempt(fresh, 'quick'));

    const weekly = (await call<WeeklyLeaderboard>('GET', '/api/leaderboard/weekly', fresh)).body;
    expect(weekly.weekOf).toBe('2026-10-05');
    expect(weekly.entries.map((e) => e.nickname)).toEqual(['ThisWeek']);
    expect(weekly.me?.rank).toBe(1);

    const allTime = (await call<AllTimeLeaderboard>('GET', '/api/leaderboard/all-time')).body;
    expect(allTime.entries).toHaveLength(2);
  });

  it('ranks best singles from Quick and Daily, with an Ao5 after five solves', async () => {
    const slow = await server.register('Steady');
    const quick = await server.register('Speedy');
    for (let i = 0; i < 5; i++) {
      const attempt = await server.startAttempt(slow, 'quick');
      await server.submit(slow, attempt, solution(attempt.seed, 300 - i * 10));
    }
    const one = await server.startAttempt(quick, 'quick');
    await server.submit(quick, one, solution(one.seed, 150));
    // A faster blindfold solve isn't comparable, so it doesn't count here.
    const blind = await server.startAttempt(quick, 'blindfold');
    await server.submit(quick, blind, solution(blind.seed, 100));

    const board = (await call<FastestLeaderboard>('GET', '/api/leaderboard/fastest', slow)).body;
    // A solve's time is the last move's timestamp: 24 steps after the first.
    expect(board.entries.map((e) => [e.nickname, e.bestMs])).toEqual([
      ['Speedy', 24 * 150],
      ['Steady', 24 * 260],
    ]);
    // Steady's steps were 300, 290, 280, 270, 260: dropping best and worst leaves 290..270.
    expect(board.me).toMatchObject({ rank: 2, ao5Ms: 24 * 280 });
    expect(board.entries[0]!.ao5Ms).toBeNull();
  });
});
