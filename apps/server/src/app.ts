import {
  CHALLENGE_CODE_PATTERN,
  dailySeed,
  LESSON_IDS,
  LOGIN_CODE_ALPHABET,
  LOGIN_CODE_LENGTH,
  MAX_SOLVE_MOVES,
  nicknameProblem,
  normalizeLoginCode,
  SHOP,
  THEMES,
  utcDateKey,
  utcWeekStart,
  type AllTimeLeaderboard,
  type AttemptDto,
  type ChallengeDto,
  type CreateChallengeRequest,
  type CreateAttemptRequest,
  type DailyLeaderboard,
  type FastestLeaderboard,
  type GhostDto,
  type LessonsRequest,
  type LessonsResponse,
  type LoginCodeResponse,
  type LoginRequest,
  type MeResponse,
  type PlayerDto,
  type RegisterRequest,
  type RegisterResponse,
  type StatsResponse,
  type SolveDto,
  type SubmitSolveRequest,
  type TimedMoveDto,
  type UnlockRequest,
  type UnlockResponse,
  type WalletDto,
  type WeeklyLeaderboard,
} from '@cuberush/api';
import {
  computePoints,
  computeSurvivalPoints,
  MODE_IDS,
  modeMultiplier,
  type PointsBreakdown,
} from '@cuberush/cube-core';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { evaluateAchievements, unlockedIds } from './achievements.js';
import { checkSubmission, checkSurvival, RULES } from './anticheat.js';
import type { Db } from './db.js';
import { createRepo, currentStreak, streakLength } from './repo.js';

declare module 'fastify' {
  interface FastifyRequest {
    player: PlayerDto | null;
    /** Hash of the session token the request came with, once `requirePlayer` accepted it. */
    tokenHash: string | null;
  }
}

export interface AppOptions {
  db: Db;
  /** Server clock; injectable so tests can move time. */
  now?: () => number;
  /** Per-IP request limits; tests turn them off. */
  rateLimit?: boolean;
  /** Folder with the built web app to serve next to the API. */
  webRoot?: string | undefined;
  logger?: boolean;
  /** Set when running behind a reverse proxy so rate limits see real client IPs. */
  trustProxy?: boolean;
}

const LEADERBOARD_LIMIT = 50;
const STATS_LIMIT = 500;
const FREE_THEMES = THEMES.filter((t) => t.cost === 0).map((t) => t.id);
const CHALLENGE_RESULTS_LIMIT = 10;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Random 8-character code from an alphabet without look-alikes (0/O, 1/l/I). */
function challengeCode(): string {
  return Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** A fresh login code like `ABCD-EFGH-JKLM-NPQR` (80 random bits: 32 letters, 16 of them). */
function loginCode(): string {
  const chars = Array.from(
    randomBytes(LOGIN_CODE_LENGTH),
    (b) => LOGIN_CODE_ALPHABET[b % LOGIN_CODE_ALPHABET.length],
  ).join('');
  return chars.match(/.{4}/g)!.join('-');
}

function randomSeed(prefix: string): string {
  return `${prefix}-${randomBytes(9).toString('base64url')}`;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function fail(reply: FastifyReply, status: number, error: string, message: string) {
  return reply.code(status).send({ error, message });
}

const limitQuery = { type: 'integer', minimum: 1, maximum: 100, default: LEADERBOARD_LIMIT };

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 256 * 1024,
    trustProxy: options.trustProxy ?? false,
  });
  const repo = createRepo(options.db);
  const now = options.now ?? Date.now;
  const today = () => utcDateKey(new Date(now()));

  app.setErrorHandler((error: { statusCode?: number; message: string }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) request.log.error(error);
    const code = status === 400 ? 'bad_request' : status === 429 ? 'rate_limited' : 'server_error';
    return fail(reply, status, code, status >= 500 ? 'Something went wrong.' : error.message);
  });

  if (options.rateLimit !== false) {
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  }

  app.decorateRequest('player', null);
  app.decorateRequest('tokenHash', null);
  const bearerHash = (request: FastifyRequest): string | null => {
    const token = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1];
    return token ? hashToken(token) : null;
  };
  const identify = (request: FastifyRequest): PlayerDto | null => {
    const hash = bearerHash(request);
    return hash ? (repo.playerByTokenHash(hash, now()) ?? null) : null;
  };
  /** Starts a session for `player` on the calling device. */
  const signIn = (player: PlayerDto): RegisterResponse => {
    const token = randomBytes(32).toString('base64url');
    repo.createSession(hashToken(token), player.id, now());
    return { player, token };
  };
  const wallet = (playerId: string): WalletDto => {
    const earned = repo.totals(playerId).points;
    const spent = repo.spent(playerId);
    return { earned, spent, balance: earned - spent };
  };
  const requirePlayer = async (request: FastifyRequest, reply: FastifyReply) => {
    request.player = identify(request);
    if (!request.player) return fail(reply, 401, 'unauthorized', 'Pick a nickname first.');
    request.tokenHash = bearerHash(request);
  };

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ ok: true }));

      api.post<{ Body: RegisterRequest }>(
        '/players',
        {
          config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
          schema: {
            body: {
              type: 'object',
              required: ['nickname'],
              additionalProperties: false,
              properties: { nickname: { type: 'string', maxLength: 40 } },
            },
          },
        },
        async (request, reply) => {
          const nickname = request.body.nickname.trim();
          const problem = nicknameProblem(nickname);
          if (problem) return fail(reply, 400, 'invalid_nickname', problem);
          const player: PlayerDto = { id: randomUUID(), nickname };
          const token = randomBytes(32).toString('base64url');
          try {
            repo.createPlayer(player.id, nickname, hashToken(token), now());
          } catch (error) {
            if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
              return fail(reply, 409, 'nickname_taken', `"${nickname}" is already taken.`);
            }
            throw error;
          }
          const body: RegisterResponse = { player, token };
          return reply.code(201).send(body);
        },
      );

      api.post<{ Body: LoginRequest }>(
        '/login',
        {
          // Codes have 80 random bits, so guessing is hopeless; the limit just keeps it that way.
          config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
          schema: {
            body: {
              type: 'object',
              required: ['code'],
              additionalProperties: false,
              properties: { code: { type: 'string', maxLength: 40 } },
            },
          },
        },
        async (request, reply) => {
          const code = normalizeLoginCode(request.body.code);
          const player =
            code.length === LOGIN_CODE_LENGTH && repo.playerByLoginHash(hashToken(code));
          if (!player) {
            return fail(reply, 401, 'bad_code', 'That login code doesn’t match any player.');
          }
          return reply.code(201).send(signIn(player));
        },
      );

      api.post('/me/login-code', { preHandler: requirePlayer }, async (request, reply) => {
        const code = loginCode();
        repo.setLoginHash(request.player!.id, hashToken(normalizeLoginCode(code)));
        const body: LoginCodeResponse = { code };
        return reply.code(201).send(body);
      });

      api.post('/me/logout', { preHandler: requirePlayer }, async (request, reply) => {
        repo.deleteSession(request.tokenHash!);
        return reply.code(204).send();
      });

      api.post('/me/logout-others', { preHandler: requirePlayer }, async (request) => ({
        signedOut: repo.deleteOtherSessions(request.player!.id, request.tokenHash!),
      }));

      api.post<{ Body: LessonsRequest }>(
        '/me/lessons',
        {
          preHandler: requirePlayer,
          schema: {
            body: {
              type: 'object',
              required: ['ids'],
              additionalProperties: false,
              properties: {
                ids: {
                  type: 'array',
                  maxItems: LESSON_IDS.length,
                  items: { type: 'string', enum: [...LESSON_IDS] },
                },
              },
            },
          },
        },
        async (request) => {
          const player = request.player!;
          repo.addLessons(player.id, request.body.ids, now());
          const body: LessonsResponse = { lessons: repo.lessons(player.id) };
          return body;
        },
      );

      api.get('/me', { preHandler: requirePlayer }, async (request) => {
        const player = request.player!;
        const date = today();
        const totals = repo.totals(player.id);
        const body: MeResponse = {
          player,
          totalPoints: totals.points,
          wallet: wallet(player.id),
          skins: repo.skins(player.id),
          themes: repo.themes(player.id, FREE_THEMES),
          solves: totals.solves,
          lessons: repo.lessons(player.id),
          hasLoginCode: repo.hasLoginCode(player.id),
          otherSessions: repo.otherSessions(player.id, request.tokenHash!),
          streak: currentStreak(repo.rankedDays(player.id), date),
          daily: {
            date,
            rankedAvailable: !repo.hasAttemptForSeed(player.id, dailySeed(date)),
            entry: repo.dailyLeaderboard(dailySeed(date), 0, player.id).me,
          },
        };
        return body;
      });

      api.get('/me/achievements', { preHandler: requirePlayer }, async (request) =>
        evaluateAchievements(repo.facts(request.player!.id)),
      );

      api.get('/me/stats', { preHandler: requirePlayer }, async (request) => {
        const body: StatsResponse = { solves: repo.statSolves(request.player!.id, STATS_LIMIT) };
        return body;
      });

      api.post<{ Body: UnlockRequest }>(
        '/unlocks',
        {
          preHandler: requirePlayer,
          schema: {
            body: {
              type: 'object',
              required: ['kind', 'id'],
              additionalProperties: false,
              properties: {
                kind: { type: 'string', enum: ['skin', 'theme'] },
                id: { type: 'string', maxLength: 32 },
              },
            },
          },
        },
        async (request, reply) => {
          const player = request.player!;
          const { kind, id } = request.body;
          // Free items are owned by everyone and never bought.
          const item = SHOP[kind].find((i) => i.id === id);
          if (!item || item.cost === 0) {
            return fail(reply, 404, 'unknown_item', 'That item can’t be unlocked.');
          }
          const outcome = repo.unlock(player.id, kind, item.id, item.cost, now());
          if (outcome === 'owned') {
            return fail(reply, 409, 'already_owned', `You already own ${item.name}.`);
          }
          if (outcome === 'poor') {
            return fail(reply, 402, 'not_enough_points', `${item.name} costs ${item.cost} points.`);
          }
          const body: UnlockResponse = {
            wallet: wallet(player.id),
            skins: repo.skins(player.id),
            themes: repo.themes(player.id, FREE_THEMES),
          };
          return reply.code(201).send(body);
        },
      );

      api.post<{ Body: CreateAttemptRequest }>(
        '/attempts',
        {
          preHandler: requirePlayer,
          schema: {
            body: {
              type: 'object',
              required: ['mode'],
              additionalProperties: false,
              properties: {
                mode: { type: 'string', enum: MODE_IDS },
                retryOf: { type: 'string', maxLength: 64 },
                challenge: { type: 'string', maxLength: 16 },
              },
            },
          },
        },
        async (request, reply) => {
          const player = request.player!;
          const { mode, retryOf, challenge } = request.body;
          let seed: string;
          let ranked: boolean;
          let challengeCodeForAttempt: string | null = null;

          if (retryOf !== undefined) {
            // Replaying a scramble you've already seen is practice, never ranked.
            const original = repo.attempt(retryOf);
            if (!original || original.player_id !== player.id || original.mode !== mode) {
              return fail(reply, 404, 'attempt_not_found', 'That attempt does not exist.');
            }
            seed = original.seed;
            ranked = false;
            challengeCodeForAttempt = original.challenge_code;
          } else if (mode === 'challenge') {
            // The scramble is in the share link, so challenges are always unranked.
            const found = challenge === undefined ? undefined : repo.challenge(challenge);
            if (!found) {
              return fail(reply, 404, 'challenge_not_found', 'That challenge does not exist.');
            }
            seed = found.seed;
            ranked = false;
            challengeCodeForAttempt = found.code;
          } else if (mode === 'daily') {
            // Only the first look at the daily scramble counts.
            seed = dailySeed(today());
            ranked = !repo.hasAttemptForSeed(player.id, seed);
          } else {
            seed = randomSeed(mode === 'blindfold' ? 'blind' : mode);
            ranked = true;
          }

          const attempt: AttemptDto = { id: randomUUID(), mode, seed, ranked };
          repo.createAttempt({
            id: attempt.id,
            player_id: player.id,
            mode,
            seed,
            ranked: ranked ? 1 : 0,
            challenge_code: challengeCodeForAttempt,
            created_at: now(),
          });
          return reply.code(201).send(attempt);
        },
      );

      api.post<{ Body: SubmitSolveRequest }>(
        '/solves',
        {
          preHandler: requirePlayer,
          schema: {
            body: {
              type: 'object',
              required: ['attemptId', 'moves', 'usedUndo'],
              additionalProperties: false,
              properties: {
                attemptId: { type: 'string', maxLength: 64 },
                usedUndo: { type: 'boolean' },
                peeked: { type: 'boolean' },
                moves: {
                  type: 'array',
                  minItems: 0,
                  maxItems: MAX_SOLVE_MOVES,
                  items: {
                    type: 'object',
                    required: ['m', 't'],
                    additionalProperties: false,
                    properties: {
                      m: { type: 'string', maxLength: 8 },
                      t: { type: 'integer', minimum: 0 },
                    },
                  },
                },
              },
            },
          },
        },
        async (request, reply) => {
          const player = request.player!;
          const { attemptId, moves, usedUndo, peeked = false } = request.body;
          const attempt = repo.attempt(attemptId);
          const at = now();

          if (!attempt || attempt.player_id !== player.id) {
            return fail(reply, 404, 'attempt_not_found', 'That attempt does not exist.');
          }
          if (attempt.submitted_at !== null) {
            return fail(reply, 409, 'already_submitted', 'This attempt was already submitted.');
          }
          if (at - attempt.created_at > RULES.attemptTtlMs) {
            return fail(reply, 410, 'attempt_expired', 'This attempt has expired.');
          }

          const input = {
            seed: attempt.seed,
            attemptCreatedAt: attempt.created_at,
            now: at,
            moves,
            usedUndo,
          };
          const ranked = attempt.ranked === 1;
          const day = utcDateKey(new Date(at));
          const days = repo.rankedDays(player.id);
          if (ranked) days.add(day);
          const streak = ranked ? streakLength(days, day) : currentStreak(days, day);
          // The first day of a streak earns no bonus; each day after it does.
          const streakBonusDays = Math.max(0, streak - 1);

          let result: {
            timeMs: number;
            moveCount: number;
            usedUndo: boolean;
            points: PointsBreakdown;
            cleared: number | null;
            extra: Record<string, unknown> | null;
          };
          if (attempt.mode === 'survival') {
            const check = checkSurvival(input);
            if (!check.ok) return fail(reply, 422, check.reason, check.message);
            result = {
              timeMs: check.survivedMs,
              moveCount: check.moveCount,
              usedUndo: false,
              points: computeSurvivalPoints({ cleared: check.cleared, streak: streakBonusDays }),
              cleared: check.cleared,
              extra: { cleared: check.cleared },
            };
          } else {
            const check = checkSubmission(input);
            if (!check.ok) return fail(reply, 422, check.reason, check.message);
            result = {
              timeMs: check.timeMs,
              moveCount: check.moveCount,
              usedUndo: check.usedUndo,
              // Blindfold is on the honor system: the server can't see whether colors were hidden.
              points: computePoints({
                timeMs: check.timeMs,
                moveCount: check.moveCount,
                usedUndo: check.usedUndo,
                streak: streakBonusDays,
                modeMultiplier: modeMultiplier(attempt.mode, { peeked }),
              }),
              cleared: null,
              extra: attempt.mode === 'blindfold' ? { peeked } : null,
            };
          }

          const unlockedBefore = unlockedIds(evaluateAchievements(repo.facts(player.id)));
          const stored = repo.recordSolve({
            attemptId,
            playerId: player.id,
            mode: attempt.mode,
            seed: attempt.seed,
            ranked,
            moves,
            timeMs: result.timeMs,
            moveCount: result.moveCount,
            usedUndo: result.usedUndo,
            points: result.points.total,
            extra: result.extra,
            day,
            now: at,
          });
          if (!stored) {
            return fail(reply, 409, 'already_submitted', 'This attempt was already submitted.');
          }

          const body: SolveDto = {
            timeMs: result.timeMs,
            moveCount: result.moveCount,
            usedUndo: result.usedUndo,
            ranked,
            points: result.points,
            dailyRank:
              ranked && attempt.mode === 'daily'
                ? (repo.dailyLeaderboard(attempt.seed, 0, player.id).me?.rank ?? null)
                : null,
            streak,
            survival: result.cleared === null ? null : { cleared: result.cleared },
            newAchievements: [...unlockedIds(evaluateAchievements(repo.facts(player.id)))].filter(
              (id) => !unlockedBefore.has(id),
            ),
          };
          return reply.code(201).send(body);
        },
      );

      api.post<{ Body: CreateChallengeRequest }>(
        '/challenges',
        {
          preHandler: requirePlayer,
          schema: {
            body: {
              type: 'object',
              required: ['attemptId'],
              additionalProperties: false,
              properties: { attemptId: { type: 'string', maxLength: 64 } },
            },
          },
        },
        async (request, reply) => {
          const player = request.player!;
          const attempt = repo.attempt(request.body.attemptId);
          const solve = attempt && repo.solveForAttempt(attempt.id);
          if (!attempt || attempt.player_id !== player.id || !solve) {
            return fail(reply, 404, 'solve_not_found', 'Finish a solve before sharing it.');
          }
          // Daily scrambles stay secret until played, and survival has no single scramble.
          if (attempt.mode !== 'quick') {
            return fail(reply, 400, 'not_shareable', 'Only quick-play solves can be shared.');
          }

          const existing = repo.challengeCodeForSolve(solve.id);
          if (existing) return { code: existing };
          for (;;) {
            const code = challengeCode();
            try {
              repo.createChallenge(code, solve.id, player.id, now());
              return reply.code(201).send({ code });
            } catch (error) {
              if ((error as { code?: string }).code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw error;
            }
          }
        },
      );

      api.get<{ Params: { code: string } }>('/challenges/:code', async (request, reply) => {
        const { code } = request.params;
        const found = CHALLENGE_CODE_PATTERN.test(code) ? repo.challenge(code) : undefined;
        if (!found)
          return fail(reply, 404, 'challenge_not_found', 'That challenge does not exist.');
        const body: ChallengeDto = {
          code: found.code,
          seed: found.seed,
          creator: found.creator,
          timeMs: found.time_ms,
          moveCount: found.move_count,
          moves: JSON.parse(found.moves) as TimedMoveDto[],
          results: repo.challengeResults(found.code, CHALLENGE_RESULTS_LIMIT),
        };
        return body;
      });

      api.get('/daily/ghost', { preHandler: requirePlayer }, async (request, reply) => {
        const seed = dailySeed(today());
        // Showing today's best solve before someone's ranked try would hand them the answer.
        if (!repo.hasAttemptForSeed(request.player!.id, seed)) {
          return fail(reply, 403, 'ranked_attempt_first', 'Play your ranked daily attempt first.');
        }
        const ghost: GhostDto | undefined = repo.dailyTop(seed);
        if (!ghost)
          return fail(reply, 404, 'no_ghost', 'Nobody has solved today\u2019s scramble yet.');
        return ghost;
      });

      api.get<{ Querystring: { date?: string; limit: number } }>(
        '/leaderboard/daily',
        {
          schema: {
            querystring: {
              type: 'object',
              properties: {
                date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                limit: limitQuery,
              },
            },
          },
        },
        async (request) => {
          const date = request.query.date ?? today();
          const player = identify(request);
          const board = repo.dailyLeaderboard(
            dailySeed(date),
            request.query.limit,
            player?.id ?? null,
          );
          const body: DailyLeaderboard = { date, ...board };
          return body;
        },
      );

      api.get<{ Querystring: { limit: number } }>(
        '/leaderboard/all-time',
        {
          schema: {
            querystring: { type: 'object', properties: { limit: limitQuery } },
          },
        },
        async (request) => {
          const player = identify(request);
          const body: AllTimeLeaderboard = repo.pointsLeaderboard(
            request.query.limit,
            player?.id ?? null,
          );
          return body;
        },
      );

      api.get<{ Querystring: { limit: number } }>(
        '/leaderboard/weekly',
        {
          schema: {
            querystring: { type: 'object', properties: { limit: limitQuery } },
          },
        },
        async (request) => {
          const player = identify(request);
          const weekOf = utcWeekStart(new Date(now()));
          const board = repo.pointsLeaderboard(
            request.query.limit,
            player?.id ?? null,
            Date.parse(`${weekOf}T00:00:00Z`),
          );
          const body: WeeklyLeaderboard = { weekOf, ...board };
          return body;
        },
      );

      api.get<{ Querystring: { limit: number } }>(
        '/leaderboard/fastest',
        {
          schema: {
            querystring: { type: 'object', properties: { limit: limitQuery } },
          },
        },
        async (request) => {
          const player = identify(request);
          const body: FastestLeaderboard = repo.fastestLeaderboard(
            request.query.limit,
            player?.id ?? null,
          );
          return body;
        },
      );
    },
    { prefix: '/api' },
  );

  if (options.webRoot) {
    await app.register(fastifyStatic, { root: options.webRoot });
  }
  // Unknown API paths get JSON; everything else is a page of the single-page web app.
  app.setNotFoundHandler((request, reply) => {
    if (!options.webRoot || request.url.startsWith('/api') || request.method !== 'GET') {
      return fail(reply, 404, 'not_found', 'Not found.');
    }
    return reply.sendFile('index.html');
  });

  return app;
}
