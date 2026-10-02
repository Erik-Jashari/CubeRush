import {
  applyMoves,
  BLINDFOLD_MEMORIZE_MS,
  createSolvedCube,
  invertMoves,
  parseMove,
  parseMoves,
  statesEqual,
  SURVIVAL,
  verifySolve,
  waveMoves,
} from '@cuberush/cube-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { useGhost } from './ghost';
import { canTurn, colorsHidden, INSPECTION_MS, useGame } from './store';

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
    expect(game()).toMatchObject({ status: 'inspecting', countdownEndsAt: INSPECTION_MS });
    game().endCountdown(INSPECTION_MS);
    expect(game()).toMatchObject({ status: 'solving', startedAt: INSPECTION_MS });
  });

  it('a turn during inspection starts the timer early', () => {
    game().startGame('quick', { inspection: true, seed: 's' }, 0);
    game().turn(parseMove('U'), 4000);
    expect(game()).toMatchObject({ status: 'solving', startedAt: 4000, countdownEndsAt: null });
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

  it('starting again on the same seed replays the scramble from scratch', () => {
    game().startGame('quick', { inspection: false, seed: 'again' }, 0);
    const scramble = game().scramble;
    game().turn(parseMove('R'), 0);
    game().startGame('quick', { inspection: false, seed: 'again' }, 100);
    expect(game()).toMatchObject({ seed: 'again', status: 'ready', moveCount: 0, log: [] });
    expect(game().scramble).toEqual(scramble);
  });
});

describe('blindfold', () => {
  it('locks turns while memorizing, then hides the colors and starts the clock', () => {
    game().startGame('blindfold', { inspection: false, seed: 'blind' }, 0);
    expect(game()).toMatchObject({ status: 'memorizing', countdownEndsAt: BLINDFOLD_MEMORIZE_MS });
    expect(canTurn(game())).toBe(false);
    game().turn(parseMove('R'), 1000);
    expect(game().moveCount).toBe(0);
    expect(colorsHidden(game())).toBe(false);

    game().endCountdown(BLINDFOLD_MEMORIZE_MS);
    expect(game()).toMatchObject({ status: 'solving', startedAt: BLINDFOLD_MEMORIZE_MS });
    expect(colorsHidden(game())).toBe(true);
  });

  it('pays double, unless the player peeked', () => {
    game().startGame('blindfold', { inspection: false, seed: 'blind' }, 0);
    game().endCountdown(0);
    solveFrom(0);
    expect(game().result!.points.modeMultiplier).toBe(2);
    expect(colorsHidden(game())).toBe(false);

    game().startGame('blindfold', { inspection: false, seed: 'blind' }, 0);
    game().endCountdown(0);
    game().peek();
    expect(colorsHidden(game())).toBe(false);
    solveFrom(0);
    expect(game().result!.points.modeMultiplier).toBe(1);
  });
});

describe('survival', () => {
  const W = SURVIVAL.waveMs;

  it('starts the clock at once with wave 0 on the cube', () => {
    game().startGame('survival', { inspection: true, seed: 'surv' }, 500);
    expect(game()).toMatchObject({ status: 'solving', startedAt: 500 });
    expect(game().survival).toMatchObject({ wave: 0, lives: 3 });
    expect(game().scramble).toEqual(waveMoves('surv', 0));
  });

  it('solving a wave queues the next one for the view', () => {
    game().startGame('survival', { inspection: false, seed: 'surv' }, 0);
    for (const [i, move] of invertMoves(waveMoves('surv', 0)).entries()) game().turn(move, 100 + i);
    expect(game().survival).toMatchObject({ wave: 1, cleared: 1 });
    expect(game().animQueue.slice(-waveMoves('surv', 1).length)).toEqual(waveMoves('surv', 1));
    expect(game().undoStack).toEqual([]);
    expect(game().status).toBe('solving');
  });

  it('ticks through deadlines and ends the run on the last life', () => {
    game().startGame('survival', { inspection: false, seed: 'surv' }, 0);
    game().tick(W - 1);
    expect(game().survival!.lives).toBe(3);
    game().tick(W);
    expect(game().survival!.lives).toBe(2);
    game().tick(3 * W);
    expect(game()).toMatchObject({ status: 'solved', finishedAt: 3 * W });
    expect(game().result).toMatchObject({ timeMs: 3 * W, cleared: 0, points: { total: 0 } });
  });

  it('the logged moves replay to the same run on the server', () => {
    game().startGame('survival', { inspection: false, seed: 'surv' }, 0);
    for (const [i, move] of invertMoves(waveMoves('surv', 0)).entries()) {
      game().turn(move, 1000 + i * 300);
    }
    game().tick(10 * W);
    const log = game().log;
    expect(log[0]!.t).toBe(1000);
    expect(game().result!.cleared).toBe(1);
  });
});

describe('ghost', () => {
  it('replays a recorded solve as the clock reaches each move', () => {
    const ghost = () => useGhost.getState();
    ghost().load('g', { label: 'Alice', timeMs: 500 }, [
      { m: 'R', t: 0 },
      { m: 'U', t: 200 },
      { m: "R'", t: 500 },
    ]);
    ghost().advanceTo(0);
    expect(ghost().animQueue).toHaveLength(1);
    ghost().advanceTo(499);
    expect(ghost().animQueue).toHaveLength(2);
    ghost().advanceTo(10_000);
    expect(ghost().next).toBe(3);
  });

  it('ignores unreadable move lists', () => {
    useGhost.getState().load('g', { label: 'Bad', timeMs: 1 }, [{ m: 'Q', t: 0 }]);
    expect(useGhost.getState().info).toBeNull();
  });
});

describe('tutorial mode', () => {
  it('starts from the given cube with no countdown or timer', () => {
    const state = applyMoves(createSolvedCube(3), parseMoves('z2 R'));
    game().startGame('tutorial', { inspection: true, state }, 0);
    expect(game()).toMatchObject({ screen: 'play', status: 'ready', countdownEndsAt: null });
    expect(statesEqual(game().cube, state)).toBe(true);
  });

  it('never locks the cube or produces a result, even when solved', () => {
    game().startGame('tutorial', { inspection: false }, 0);
    game().turn(parseMove('R'), 10);
    game().turn(parseMove("R'"), 20);
    expect(game()).toMatchObject({ status: 'ready', result: null, startedAt: null });
    game().turn(parseMove('U'), 30);
    expect(game().log.map((e) => e.m)).toEqual(['R', "R'", 'U']);
  });

  it('undo works without a running clock', () => {
    game().startGame('tutorial', { inspection: false }, 0);
    game().turn(parseMove('F'), 0);
    game().undo(5);
    expect(game().log.map((e) => e.m)).toEqual(['F', "F'"]);
    expect(game().undoStack).toEqual([]);
  });
});
