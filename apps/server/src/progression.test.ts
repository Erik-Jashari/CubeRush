import type {
  AchievementDto,
  AllTimeLeaderboard,
  ChallengeDto,
  MeResponse,
  StatsResponse,
  UnlockResponse,
} from '@cuberush/api';
import { formatMove, invertMoves, waveMoves } from '@cuberush/cube-core';
import { describe, expect, it } from 'vitest';
import { evaluateAchievements, longestStreak, type PlayerFacts } from './achievements';
import { DAY_MS, solution, useTestServer } from './test-support';

const { call, advance, register, startAttempt, submit } = useTestServer();

/** Earns points with real quick solves (each is worth roughly 1,000). */
async function earn(token: string, solves: number) {
  for (let i = 0; i < solves; i++) await submit(token, await startAttempt(token, 'quick'));
}

const unlocked = (list: AchievementDto[]) => list.filter((a) => a.unlocked).map((a) => a.id);

describe('wallet and skins', () => {
  it('starts with classic and an empty wallet', async () => {
    const token = await register('Shopper');
    const me = await call<MeResponse>('GET', '/api/me', token);
    expect(me.body).toMatchObject({
      skins: ['classic'],
      wallet: { earned: 0, spent: 0, balance: 0 },
    });
  });

  it('refuses skins the player cannot afford', async () => {
    const token = await register('Shopper');
    const res = await call('POST', '/api/unlocks', token, { skin: 'pastel' });
    expect(res).toMatchObject({ status: 402, body: { error: 'not_enough_points' } });
  });

  it('spends points on a skin without touching the leaderboard total', async () => {
    const token = await register('Shopper');
    await earn(token, 2);
    const before = await call<MeResponse>('GET', '/api/me', token);
    const earned = before.body.wallet.earned;
    expect(earned).toBeGreaterThanOrEqual(1500);

    const res = await call<UnlockResponse>('POST', '/api/unlocks', token, { skin: 'pastel' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      skins: ['classic', 'pastel'],
      wallet: { earned, spent: 1500, balance: earned - 1500 },
    });

    const board = await call<AllTimeLeaderboard>('GET', '/api/leaderboard/all-time', token);
    expect(board.body.me!.points).toBe(earned);
  });

  it('sells each skin once and only real ones', async () => {
    const token = await register('Shopper');
    await earn(token, 2);
    expect((await call('POST', '/api/unlocks', token, { skin: 'pastel' })).status).toBe(201);
    expect(await call('POST', '/api/unlocks', token, { skin: 'pastel' })).toMatchObject({
      status: 409,
      body: { error: 'already_owned' },
    });
    for (const skin of ['classic', 'gold']) {
      expect(await call('POST', '/api/unlocks', token, { skin })).toMatchObject({
        status: 404,
        body: { error: 'unknown_skin' },
      });
    }
  });

  it('requires a signed-in player', async () => {
    expect((await call('POST', '/api/unlocks', undefined, { skin: 'pastel' })).status).toBe(401);
  });
});

describe('achievements', () => {
  it('a fast first solve unlocks several at once, and only once', async () => {
    const token = await register('Achiever');
    const first = await submit(token, await startAttempt(token, 'quick'));
    expect(first.body.newAchievements.sort()).toEqual(
      ['efficient', 'first-solve', 'sub-30', 'sub-60'].sort(),
    );
    const second = await submit(token, await startAttempt(token, 'quick'));
    expect(second.body.newAchievements).toEqual([]);

    const list = await call<AchievementDto[]>('GET', '/api/me/achievements', token);
    expect(list.body.find((a) => a.id === 'clean-10')).toEqual({
      id: 'clean-10',
      unlocked: false,
      progress: 2,
    });
  });

  it('counts survival waves, clean blindfold solves, challenges and skins', async () => {
    const token = await register('Achiever');

    const run = await startAttempt(token, 'survival');
    const moves = invertMoves(waveMoves(run.seed, 0)).map((m, i) => ({
      m: formatMove(m),
      t: 1000 + i * 400,
    }));
    await submit(token, run, moves);

    const blind = await submit(token, await startAttempt(token, 'blindfold'));
    expect(blind.body.newAchievements).toContain('blind');

    const creator = await register('Creator');
    const shared = await startAttempt(creator, 'quick');
    await submit(creator, shared, solution(shared.seed, 300));
    const { body } = await call<{ code: string }>('POST', '/api/challenges', creator, {
      attemptId: shared.id,
    });
    const challenge = await call<ChallengeDto>('GET', `/api/challenges/${body.code}`);
    const play = await startAttempt(token, 'challenge', { challenge: challenge.body.code });
    const beat = await submit(token, play, solution(play.seed, 150));
    expect(beat.body.newAchievements).toContain('challenger');

    await earn(token, 1);
    await call('POST', '/api/unlocks', token, { skin: 'pastel' });

    const list = await call<AchievementDto[]>('GET', '/api/me/achievements', token);
    expect(unlocked(list.body)).toEqual(
      expect.arrayContaining(['blind', 'challenger', 'collector']),
    );
    expect(list.body.find((a) => a.id === 'survivor')).toMatchObject({ progress: 1 });
  });

  it('peeking does not count as eyes closed', async () => {
    const token = await register('Peeker');
    const res = await submit(token, await startAttempt(token, 'blindfold'), undefined, {
      peeked: true,
    });
    expect(res.body.newAchievements).not.toContain('blind');
  });

  it('tracks the longest daily streak', async () => {
    const token = await register('Regular');
    for (let day = 0; day < 3; day++) {
      await earn(token, 1);
      advance(DAY_MS);
    }
    const list = await call<AchievementDto[]>('GET', '/api/me/achievements', token);
    expect(list.body.find((a) => a.id === 'streak-3')).toMatchObject({
      unlocked: true,
      progress: 3,
    });
  });
});

describe('rules', () => {
  const none: PlayerFacts = {
    solves: 0,
    bestMs: null,
    fewestMoves: null,
    solvesWithoutUndo: 0,
    longestStreak: 0,
    mostWaves: 0,
    blindWithoutPeek: false,
    beatAChallenge: false,
    skinsUnlocked: 0,
  };

  it('a new player has nothing unlocked', () => {
    expect(unlocked(evaluateAchievements(none))).toEqual([]);
  });

  it('caps progress at the target', () => {
    const list = evaluateAchievements({ ...none, longestStreak: 25 });
    expect(list.find((a) => a.id === 'streak-10')).toMatchObject({ unlocked: true, progress: 10 });
  });

  it('finds the longest run of consecutive days', () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02'])).toBe(3);
    expect(longestStreak(['2026-10-02', '2026-10-02'])).toBe(1);
  });
});

describe('stats', () => {
  it('lists solves oldest first, without survival runs', async () => {
    const token = await register('Stats');
    await submit(token, await startAttempt(token, 'quick'));
    const second = await startAttempt(token, 'quick');
    await submit(token, second, solution(second.seed, 300));
    await submit(token, await startAttempt(token, 'survival'), []);

    const res = await call<StatsResponse>('GET', '/api/me/stats', token);
    expect(res.body.solves.map((s) => [s.mode, s.timeMs])).toEqual([
      ['quick', 4800],
      ['quick', 7200],
    ]);
    expect(res.body.solves[0]).toMatchObject({ moveCount: 25, ranked: true });
  });
});
