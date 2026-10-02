import type { TimedMoveDto } from '@cuberush/api';
import {
  formatMove,
  generateScramble,
  invertMoves,
  parseMoves,
  verifySolve,
} from '@cuberush/cube-core';
import { describe, expect, it, vi } from 'vitest';
import { checkSubmission, containsUndo, RULES } from './anticheat';

vi.mock('@cuberush/cube-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@cuberush/cube-core')>();
  return { ...original, verifySolve: vi.fn(original.verifySolve) };
});

const SEED = 'quick-test';

/** A real solution (the reversed scramble), one turn every `stepMs`. */
function solution(stepMs = 200, seed = SEED): TimedMoveDto[] {
  return invertMoves(generateScramble(seed)).map((move, i) => ({
    m: formatMove(move),
    t: i * stepMs,
  }));
}

function check(moves: TimedMoveDto[], overrides: { now?: number; usedUndo?: boolean } = {}) {
  return checkSubmission({
    seed: SEED,
    attemptCreatedAt: 0,
    now: overrides.now ?? 60_000,
    moves,
    usedUndo: overrides.usedUndo ?? false,
  });
}

describe('checkSubmission', () => {
  it('accepts a real solve and takes the time from the last turn', () => {
    expect(check(solution())).toEqual({ ok: true, timeMs: 4800, moveCount: 25, usedUndo: false });
  });

  it('rejects moves that do not solve the scramble', () => {
    expect(check(solution().slice(0, -1))).toMatchObject({ ok: false, reason: 'not_solved' });
    expect(check(solution(200, 'other-seed'))).toMatchObject({ ok: false, reason: 'not_solved' });
    expect(check([])).toMatchObject({ ok: false, reason: 'not_solved' });
  });

  it('rejects unknown notation', () => {
    const moves = [{ m: 'Q', t: 0 }, ...solution()];
    expect(check(moves)).toMatchObject({ ok: false, reason: 'invalid_move' });
  });

  it('rejects timestamps that go backwards or are not whole numbers', () => {
    const backwards = solution();
    backwards[5] = { ...backwards[5]!, t: 0 };
    expect(check(backwards)).toMatchObject({ ok: false, reason: 'invalid_timestamps' });
    const fractional = solution();
    fractional[3] = { ...fractional[3]!, t: 600.5 };
    expect(check(fractional)).toMatchObject({ ok: false, reason: 'invalid_timestamps' });
  });

  it('rejects a solve longer than the attempt has existed', () => {
    expect(check(solution(), { now: 1000 })).toMatchObject({ ok: false, reason: 'time_mismatch' });
    // Small clock differences are allowed.
    expect(check(solution(), { now: 4800 - RULES.clockSlackMs + 1 }).ok).toBe(true);
  });

  it('rejects inhuman turn speeds', () => {
    expect(check(solution(10))).toMatchObject({ ok: false, reason: 'too_fast' });
    expect(check(solution(0))).toMatchObject({ ok: false, reason: 'too_fast' });
  });

  it('rejects solutions shorter than a person could find under time pressure', () => {
    // Real 25-move scrambles have no short solutions to hand, so pretend these 6 moves solve it.
    vi.mocked(verifySolve).mockReturnValueOnce({ solved: true, moveCount: 6 });
    const moves = solution(500).slice(0, 6);
    expect(check(moves)).toMatchObject({ ok: false, reason: 'implausible_solution' });
  });

  it('detects undo from a turn that is immediately reversed', () => {
    const [first, ...rest] = solution();
    const withUndo = [
      first!,
      { m: 'R', t: 10 },
      { m: "R'", t: 20 },
      ...rest.map((e) => ({ ...e, t: e.t + 20 })),
    ];
    expect(check(withUndo)).toMatchObject({ ok: true, usedUndo: true, moveCount: 27 });
    expect(check(solution(), { usedUndo: true })).toMatchObject({ ok: true, usedUndo: true });
  });
});

describe('containsUndo', () => {
  it('spots any turn followed by its inverse', () => {
    expect(containsUndo(parseMoves("R U U' F"))).toBe(true);
    expect(containsUndo(parseMoves('R2 R2'))).toBe(true);
    expect(containsUndo(parseMoves("R U R' U'"))).toBe(false);
  });
});
