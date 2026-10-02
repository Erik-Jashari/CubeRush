import type {
  AttemptDto,
  CreateAttemptRequest,
  Mode,
  RegisterResponse,
  SolveDto,
  TimedMoveDto,
} from '@cuberush/api';
import { formatMove, generateScramble, invertMoves } from '@cuberush/cube-core';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, expect } from 'vitest';
import { buildApp } from './app';
import { openDatabase } from './db';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The reversed scramble, one turn every `stepMs`: a genuine solve taking 24 × stepMs. */
export function solution(seed: string, stepMs = 200): TimedMoveDto[] {
  return invertMoves(generateScramble(seed)).map((move, i) => ({
    m: formatMove(move),
    t: i * stepMs,
  }));
}

/**
 * A fresh in-memory server per test with a controllable clock, plus helpers that call it.
 * Call at the top level of a test file.
 */
export function useTestServer() {
  let clock = 0;
  let app: FastifyInstance;

  beforeEach(async () => {
    clock = Date.parse('2026-10-02T12:00:00Z');
    app = await buildApp({ db: openDatabase(':memory:'), now: () => clock, rateLimit: false });
  });
  afterEach(async () => {
    await app.close();
  });

  const call = async <T>(method: 'GET' | 'POST', url: string, token?: string, body?: object) => {
    const res = await app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(body ? { payload: body } : {}),
    });
    return { status: res.statusCode, body: res.json() as T };
  };

  return {
    call,
    /** Moves the server clock forward. */
    advance(ms: number) {
      clock += ms;
    },

    async register(nickname: string): Promise<string> {
      const res = await call<RegisterResponse>('POST', '/api/players', undefined, { nickname });
      expect(res.status).toBe(201);
      return res.body.token;
    },

    async startAttempt(token: string, mode: Mode, extra: Omit<CreateAttemptRequest, 'mode'> = {}) {
      const res = await call<AttemptDto>('POST', '/api/attempts', token, { mode, ...extra });
      expect(res.status).toBe(201);
      return res.body;
    },

    /** Plays an attempt: waits a minute on the server clock, then submits the moves. */
    async submit(
      token: string,
      attempt: AttemptDto,
      moves = solution(attempt.seed),
      extra: { peeked?: boolean } = {},
    ) {
      clock += 60_000;
      return call<SolveDto>('POST', '/api/solves', token, {
        attemptId: attempt.id,
        moves,
        usedUndo: false,
        ...extra,
      });
    },
  };
}
