import { invertMoves, parseMove, parseMoves, statesEqual, verifySolve } from '@cuberush/cube-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { INSPECTION_MS, useGame } from './store';

const game = () => useGame.getState();

function solveFrom(start: number, stepMs = 100): number {
  let now = start;
  for (const move of invertMoves(game().scramble)) {
    now += stepMs;
    game().turn(move, now);
  }
  return now;
}

beforeEach(() => {
  game().goHome();
});

describe('game store', () => {
  it('starts on the home screen with a solved cube', () => {
    expect(game().screen).toBe('home');
    expect(game().scramble).toEqual([]);
  });

  it('ignores turns on the home screen', () => {
    game().turn(parseMove('R'), 0);
    expect(game().moveCount).toBe(0);
  });

  it('starts a seeded round', () => {
    game().startGame('quick', { inspection: false, seed: 'abc' }, 1000);
    expect(game()).toMatchObject({ screen: 'play', seed: 'abc', status: 'ready', startedAt: null });
    expect(game().scramble).toHaveLength(25);
  });

  it('uses the same scramble for every daily round on the same day', () => {
    game().startGame('daily', { inspection: false });
    const first = game().scramble;
    game().startGame('daily', { inspection: false });
    expect(game().seed).toMatch(/^daily-\d{4}-\d{2}-\d{2}$/);
    expect(game().scramble).toEqual(first);
  });

  it('starts the timer on the first turn', () => {
    game().startGame('quick', { inspection: false, seed: 's' }, 0);
    game().turn(parseMove('R'), 2500);
    expect(game()).toMatchObject({ status: 'solving', startedAt: 2500, moveCount: 1 });
    expect(game().log).toEqual([{ m: 'R', t: 0 }]);
  });

  it('runs inspection, then starts the timer when it ends', () => {
    game().startGame('quick', { inspection: true, seed: 's' }, 0);
    expect(game()).toMatchObject({ status: 'inspecting', inspectionEndsAt: INSPECTION_MS });
    game().endInspection(INSPECTION_MS);
    expect(game()).toMatchObject({ status: 'solving', startedAt: INSPECTION_MS });
  });

  it('a turn during inspection starts the timer early', () => {
    game().startGame('quick', { inspection: true, seed: 's' }, 0);
    game().turn(parseMove('U'), 4000);
    expect(game()).toMatchObject({ status: 'solving', startedAt: 4000, inspectionEndsAt: null });
  });

  it('detects the solve, stops the clock and scores it', () => {
    game().startGame('quick', { inspection: false, seed: 'solve-me' }, 0);
    const end = solveFrom(0);
    const s = game();
    expect(s.status).toBe('solved');
    expect(s.result).toMatchObject({ timeMs: end - 100, moveCount: 25, usedUndo: false });
    expect(s.result!.points.total).toBeGreaterThan(0);
  });

  it('logs a move list the server can verify', () => {
    game().startGame('quick', { inspection: false, seed: 'verify-me' }, 0);
    solveFrom(0);
    const moves = parseMoves(
      game()
        .log.map((e) => e.m)
        .join(' '),
    );
    expect(verifySolve('verify-me', moves).solved).toBe(true);
    const times = game().log.map((e) => e.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('locks the cube once solved', () => {
    game().startGame('quick', { inspection: false, seed: 'lock' }, 0);
    const end = solveFrom(0);
    game().turn(parseMove('R'), end + 100);
    expect(game().moveCount).toBe(25);
    expect(game().status).toBe('solved');
  });

  it('undo reverses the last turn, logs it and drops the no-undo bonus', () => {
    game().startGame('quick', { inspection: false, seed: 'undo' }, 0);
    const scrambled = game().cube;
    game().turn(parseMove('R'), 0);
    game().undo(500);
    const s = game();
    expect(statesEqual(s.cube, scrambled)).toBe(true);
    expect(s.log.map((e) => e.m)).toEqual(['R', "R'"]);
    expect(s.usedUndo).toBe(true);
    expect(s.undoStack).toEqual([]);
    game().undo(600); // nothing left to undo
    expect(game().log).toHaveLength(2);
  });

  it('queues animations and the view catches up', () => {
    game().startGame('quick', { inspection: false, seed: 'anim' }, 0);
    game().turn(parseMove('R'), 0);
    game().turn(parseMove('U'), 10);
    expect(game().animQueue).toHaveLength(2);
    expect(game().displayed).not.toEqual(game().cube);
    game().finishAnimation();
    game().finishAnimation();
    expect(game().animQueue).toHaveLength(0);
    expect(game().displayed).toEqual(game().cube);
  });

  it('restart replays the same scramble from scratch', () => {
    game().startGame('quick', { inspection: false, seed: 'again' }, 0);
    const scramble = game().scramble;
    game().turn(parseMove('R'), 0);
    game().restart(100);
    expect(game()).toMatchObject({ seed: 'again', status: 'ready', moveCount: 0, log: [] });
    expect(game().scramble).toEqual(scramble);
  });
});
