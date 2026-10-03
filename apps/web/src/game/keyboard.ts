import { formatMove, movesEqual, parseMove, type Move } from '@cuberush/cube-core';
import { useEffect } from 'react';
import { useSettings } from './settings';
import { canTurn, useGame } from './store';

/**
 * csTimer's virtual-cube layout, which keyboard cubers already know: the right hand turns R and
 * U (I/K, J), the left hand L and U′ (D/E, F), the index fingers F (H/G).
 */
export const KEYMAP: Readonly<Record<string, string>> = {
  i: 'R',
  k: "R'",
  j: 'U',
  f: "U'",
  h: 'F',
  g: "F'",
  d: 'L',
  e: "L'",
  s: 'D',
  l: "D'",
  w: 'B',
  o: "B'",
  u: 'Rw',
  m: "Rw'",
  v: 'Lw',
  r: "Lw'",
  ',': 'Uw',
  c: "Uw'",
  z: 'Dw',
  '/': "Dw'",
  '5': 'M',
  '6': 'M',
  x: "M'",
  '.': "M'",
  t: 'x',
  y: 'x',
  b: "x'",
  n: "x'",
  ';': 'y',
  a: "y'",
  p: 'z',
  q: "z'",
};

/** The keyboard rows, for drawing the cheat sheet. */
export const KEY_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'] as const;

/** The key(s) that make `move`, e.g. R → `I`, R2 → `I I`; for showing next to a hint. */
export function keyFor(move: Move): string | undefined {
  // A half turn is two of the clockwise quarter turn: R2 → R R.
  const quarter = move.turns === 2 ? parseMove(formatMove(move).replace(/2'?$/, '')) : move;
  const key = Object.keys(KEYMAP).find((k) => movesEqual(parseMove(KEYMAP[k]!), quarter));
  if (!key) return undefined;
  const label = key.toUpperCase();
  return move.turns === 2 ? `${label} ${label}` : label;
}

function typingInField(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  return (
    el !== null &&
    (el.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName ?? ''))
  );
}

/** The turn a key press stands for, or null for other keys, shortcuts and typing. */
export function keyToMove(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>,
): Move | null {
  if (e.ctrlKey || e.metaKey || e.altKey || typingInField(e.target)) return null;
  const notation = KEYMAP[e.key.toLowerCase()];
  return notation ? parseMove(notation) : null;
}

/** Turns the cube from the keyboard (when enabled) and undoes with Ctrl/Cmd+Z. */
export function useKeyboardTurns(): void {
  const enabled = useSettings((s) => s.keyboard);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = useGame.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        game.undo();
        return;
      }
      if (!enabled || e.repeat) return;
      const move = keyToMove(e);
      if (move && canTurn(game)) {
        e.preventDefault();
        game.turn(move);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
