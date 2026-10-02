import { describe, expect, it } from 'vitest';
import { applyMoves, isSolved } from './cube.js';
import { invertMoves } from './move.js';
import { formatMoves } from './notation.js';
import { createScrambledCube, generateScramble } from './scramble.js';

const SEEDS = ['daily-2026-10-02', 'abc123', 'survival:7', ''];

function faceOf(token: string): string {
  return token.replace(/^\d+/, '')[0]!;
}

const AXIS: Record<string, string> = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' };

describe('generateScramble', () => {
  it('gives the same scramble for the same seed', () => {
    for (const seed of SEEDS) {
      expect(formatMoves(generateScramble(seed))).toBe(formatMoves(generateScramble(seed)));
    }
  });

  it('gives different scrambles for different seeds', () => {
    expect(formatMoves(generateScramble('a'))).not.toBe(formatMoves(generateScramble('b')));
  });

  it('uses the default length per size, or the requested one', () => {
    expect(generateScramble('s')).toHaveLength(25);
    expect(generateScramble('s', { n: 2 })).toHaveLength(11);
    expect(generateScramble('s', { n: 4 })).toHaveLength(40);
    expect(generateScramble('s', { length: 8 })).toHaveLength(8);
    expect(generateScramble('s', { length: 0 })).toEqual([]);
  });

  it('never repeats a face or makes three turns on one axis in a row', () => {
    for (const seed of SEEDS) {
      const faces = formatMoves(generateScramble(seed, { length: 200 }))
        .split(' ')
        .map(faceOf);
      for (let i = 1; i < faces.length; i++) {
        expect(faces[i]).not.toBe(faces[i - 1]);
        if (i >= 2) {
          const sameAxis =
            AXIS[faces[i]!] === AXIS[faces[i - 1]!] && AXIS[faces[i]!] === AXIS[faces[i - 2]!];
          expect(sameAxis).toBe(false);
        }
      }
    }
  });

  it('only uses R, U and F on a 2x2', () => {
    const tokens = formatMoves(generateScramble('two', { n: 2, length: 100 }), 2).split(' ');
    expect(new Set(tokens.map(faceOf))).toEqual(new Set(['R', 'U', 'F']));
  });

  it('uses wide moves on big cubes', () => {
    const text = formatMoves(generateScramble('big', { n: 5 }), 5);
    expect(text).toMatch(/w/);
  });
});

describe('createScrambledCube', () => {
  it('produces an unsolved cube that its inverse solves', () => {
    for (const n of [2, 3, 4, 5]) {
      for (const seed of SEEDS) {
        const { scramble, state } = createScrambledCube(seed, { n });
        expect(isSolved(state)).toBe(false);
        expect(isSolved(applyMoves(state, invertMoves(scramble)))).toBe(true);
      }
    }
  });
});
