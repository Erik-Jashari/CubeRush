import { describe, expect, it } from 'vitest';
import { invertMoves } from './move.js';
import { formatMove, formatMoves, NotationError, parseMove, parseMoves } from './notation.js';

describe('parseMove', () => {
  it('parses face turns into layer ranges', () => {
    expect(parseMove('R')).toEqual({ axis: 'x', from: 2, to: 2, turns: -1 });
    expect(parseMove("L'")).toEqual({ axis: 'x', from: 0, to: 0, turns: -1 });
    expect(parseMove('U2')).toEqual({ axis: 'y', from: 2, to: 2, turns: 2 });
    expect(parseMove('B')).toEqual({ axis: 'z', from: 0, to: 0, turns: 1 });
  });

  it('parses wide moves, slices and rotations', () => {
    expect(parseMove('Rw')).toEqual({ axis: 'x', from: 1, to: 2, turns: -1 });
    expect(parseMove('r')).toEqual(parseMove('Rw'));
    expect(parseMove('M')).toEqual({ axis: 'x', from: 1, to: 1, turns: 1 });
    expect(parseMove('x')).toEqual({ axis: 'x', from: 0, to: 2, turns: -1 });
  });

  it('parses big-cube prefixes', () => {
    expect(parseMove('3Rw', 5)).toEqual({ axis: 'x', from: 2, to: 4, turns: -1 });
    expect(parseMove("2L'", 5)).toEqual({ axis: 'x', from: 1, to: 1, turns: -1 });
  });

  it("accepts typographic primes and 2' as a half turn", () => {
    expect(parseMove('R’')).toEqual(parseMove("R'"));
    expect(parseMove("R2'")).toEqual(parseMove('R2'));
  });

  it('rejects invalid tokens', () => {
    for (const bad of ['Q', 'R3', "R''", '', '2M', '2r']) {
      expect(() => parseMove(bad)).toThrow(NotationError);
    }
    expect(() => parseMove('4R', 3)).toThrow(NotationError);
    expect(() => parseMove('M', 4)).toThrow(NotationError);
  });
});

describe('parseMoves', () => {
  it('splits on any whitespace', () => {
    expect(parseMoves("  R U\tR'\n U' ")).toHaveLength(4);
    expect(parseMoves('')).toEqual([]);
  });
});

describe('formatMove', () => {
  it('round-trips canonical notation on a 3x3', () => {
    const seq = "R U R' U2 F2 L' D B' M E' S2 x y' z2 Rw Lw' Uw2 Dw Fw' Bw";
    expect(formatMoves(parseMoves(seq))).toBe(seq);
  });

  it('round-trips canonical notation on bigger cubes', () => {
    expect(formatMoves(parseMoves("3Rw 2L' Lw2 2U Dw' 3Fw2", 6), 6)).toBe(
      "3Rw 2L' Lw2 2U Dw' 3Fw2",
    );
    expect(formatMoves(parseMoves("M' 2R 3Bw", 5), 5)).toBe("M' 2R 3Bw");
  });

  it('formats inverted sequences', () => {
    expect(formatMoves(invertMoves(parseMoves("R U2 F'")))).toBe("F U2 R'");
  });

  it('rejects inner blocks that have no standard notation', () => {
    expect(() => formatMove({ axis: 'x', from: 1, to: 2, turns: 1 }, 4)).toThrow(RangeError);
  });
});
