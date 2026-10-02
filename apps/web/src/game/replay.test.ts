import {
  parseMove,
  statesEqual,
  applyMoves,
  createScrambledCube,
  parseMoves,
} from '@cuberush/cube-core';
import { describe, expect, it } from 'vitest';
import { useReplay } from './replay';
import { turnFace } from './sound';

const replay = () => useReplay.getState();
const LOG = [
  { m: 'R', t: 0 },
  { m: 'U', t: 400 },
  { m: "R'", t: 1000 },
];

describe('replay', () => {
  it('starts playing from the scramble', () => {
    replay().open('seed', LOG, 1000);
    expect(replay()).toMatchObject({ playing: true, clockMs: 0, next: 0 });
    expect(statesEqual(replay().displayed, createScrambledCube('seed').state)).toBe(true);
  });

  it('plays moves as the clock passes them, scaled by speed', () => {
    replay().open('seed', LOG, 1000);
    replay().setSpeed(0.5);
    replay().advance(600); // 300 ms of solve time
    expect(replay().next).toBe(1);
    replay().setSpeed(2);
    replay().advance(100); // +200 ms → 500
    expect(replay()).toMatchObject({ next: 2, clockMs: 500 });
  });

  it('stops at the end and plays again from the start', () => {
    replay().open('seed', LOG, 1000);
    replay().setSpeed(1);
    replay().advance(5000);
    expect(replay()).toMatchObject({ playing: false, clockMs: 1000, next: 3 });

    while (replay().animQueue.length > 0) replay().finishAnimation();
    const end = applyMoves(createScrambledCube('seed').state, parseMoves("R U R'"));
    expect(statesEqual(replay().displayed, end)).toBe(true);

    replay().togglePlay();
    expect(replay()).toMatchObject({ playing: true, clockMs: 0, next: 0 });
  });

  it('pauses and resumes', () => {
    replay().open('seed', LOG, 1000);
    replay().togglePlay();
    replay().advance(500);
    expect(replay().clockMs).toBe(0);
  });
});

describe('turnFace', () => {
  it('names outer layers by side, inner ones as slices', () => {
    expect(turnFace(parseMove('R'), 3)).toBe('R');
    expect(turnFace(parseMove("L'"), 3)).toBe('L');
    expect(turnFace(parseMove('M'), 3)).toBe('M');
    expect(turnFace(parseMove('U2'), 3)).toBe('U');
    expect(turnFace(parseMove('x'), 3)).toBe('rotation');
  });
});
