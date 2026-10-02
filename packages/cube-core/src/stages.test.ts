import { describe, expect, it } from 'vitest';
import { ALGORITHMS } from './algorithms.js';
import { applyMoves, createSolvedCube, getStickers, type CubeState } from './cube.js';
import { parseMoves } from './notation.js';
import { practiceCube } from './practice.js';
import { stageReached, STAGES, type Stage } from './stages.js';

/** Solved cube held white-down, then the given moves. */
function held(moves = ''): CubeState {
  return applyMoves(createSolvedCube(3), parseMoves(`z2 ${moves}`));
}

describe('stageReached', () => {
  it('a solved cube has every stage done, in any orientation', () => {
    expect(stageReached(createSolvedCube(3))).toBe(7);
    for (const turn of ['x', 'y2', "z'", 'z2 y']) {
      expect(stageReached(applyMoves(createSolvedCube(3), parseMoves(turn)))).toBe(7);
    }
  });

  it('turning the white layer breaks the cross', () => {
    expect(stageReached(held('D'))).toBe(0);
    expect(stageReached(held('R'))).toBe(0);
  });

  it('turning the yellow layer keeps the first two layers and the yellow cross', () => {
    expect(stageReached(held('U'))).toBe(4);
  });

  it('each algorithm leaves the stages it should', () => {
    const { yellowCross, sune, cornerCycle, rightInsert, leftInsert } = ALGORITHMS;
    expect(stageReached(held(yellowCross.notation))).toBe(3);
    expect(stageReached(held(sune.notation))).toBeGreaterThanOrEqual(3);
    // The corner cycle keeps the yellow edges; only the corners move.
    expect(stageReached(held(cornerCycle.notation))).toBe(5);
    expect(stageReached(held(rightInsert.notation))).toBe(2);
    expect(stageReached(held(leftInsert.notation))).toBe(2);
  });

  it('the corner twist undoes itself after six goes', () => {
    const six = Array.from({ length: 6 }, () => ALGORITHMS.cornerTwist.notation).join(' ');
    expect(stageReached(held(six))).toBe(7);
  });

  it('names every stage', () => {
    expect(STAGES).toHaveLength(7);
  });
});

describe('practiceCube', () => {
  const stages: Stage[] = [1, 2, 3, 4, 5, 6, 7];

  for (const stage of stages) {
    it(`stage ${stage} (${STAGES[stage - 1]}): earlier stages done, this one not`, () => {
      for (let i = 0; i < 100; i++) {
        expect(stageReached(practiceCube(stage, `seed-${i}`).state)).toBe(stage - 1);
      }
    });
  }

  it('holds the cube white side down', () => {
    const { state } = practiceCube(4, 'x');
    const whiteCenter = getStickers(state).find(
      (s) => s.color === 'U' && state.cubies[s.cubieId]!.home.filter((v) => v !== 0).length === 1,
    )!;
    expect(whiteCenter.normal).toEqual([0, -1, 0]);
  });

  it('is deterministic per seed and differs between seeds', () => {
    expect(practiceCube(3, 'a').setup).toEqual(practiceCube(3, 'a').setup);
    expect(practiceCube(3, 'a').setup).not.toEqual(practiceCube(3, 'b').setup);
  });
});
