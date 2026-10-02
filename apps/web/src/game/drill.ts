import { invertMove, movesEqual, parseMoves, type Move } from '@cuberush/cube-core';

/** Following a move sequence turn by turn, as lessons ask the player to. */
export interface Drill {
  expected: Move[];
  /** How many expected moves are done. */
  index: number;
  /** First quarter of an expected half turn (dragging only makes quarter turns). */
  half: Move | null;
  /** Off-script turns, which must be undone (last first) before continuing. */
  wrong: Move[];
}

export function startDrill(notation: string): Drill {
  return { expected: parseMoves(notation), index: 0, half: null, wrong: [] };
}

const sameLayer = (a: Move, b: Move) => a.axis === b.axis && a.from === b.from && a.to === b.to;

export function drillStep(drill: Drill, move: Move): Drill {
  const lastWrong = drill.wrong.at(-1);
  if (lastWrong) {
    return movesEqual(move, invertMove(lastWrong))
      ? { ...drill, wrong: drill.wrong.slice(0, -1) }
      : { ...drill, wrong: [...drill.wrong, move] };
  }

  const target = drill.expected[drill.index];
  if (target && movesEqual(move, target)) {
    return { ...drill, index: drill.index + 1, half: null };
  }
  // A half turn done as two quarter turns the same way.
  if (target?.turns === 2 && sameLayer(move, target) && move.turns !== 2) {
    if (!drill.half) return { ...drill, half: move };
    if (movesEqual(move, drill.half)) return { ...drill, index: drill.index + 1, half: null };
    if (movesEqual(move, invertMove(drill.half))) return { ...drill, half: null };
  }
  return { ...drill, wrong: [...drill.wrong, move] };
}

export function drillDone(drill: Drill): boolean {
  return drill.index === drill.expected.length && drill.wrong.length === 0;
}

/** The turn to show next: undo the last wrong move, finish a half turn, or the next move. */
export function drillHint(drill: Drill): Move | null {
  const lastWrong = drill.wrong.at(-1);
  if (lastWrong) return invertMove(lastWrong);
  if (drill.half) return drill.half;
  return drill.expected[drill.index] ?? null;
}
