import { formatMove, invertMove, movesEqual, parseMove } from '@cuberush/cube-core';
import { describe, expect, it } from 'vitest';
import { keyFor, KEYMAP, KEY_ROWS, keyToMove } from './keyboard';

const press = (key: string, extra: Partial<KeyboardEvent> = {}) =>
  keyToMove({ key, ctrlKey: false, metaKey: false, altKey: false, target: null, ...extra });
const name = (key: string, extra?: Partial<KeyboardEvent>) => {
  const m = press(key, extra);
  return m && formatMove(m);
};

describe('keyboard turns', () => {
  it('uses the csTimer home-row layout', () => {
    expect(
      ['i', 'k', 'j', 'f', 'h', 'g', 'd', 'e', 's', 'l', 'w', 'o'].map((k) => name(k)),
    ).toEqual(['R', "R'", 'U', "U'", 'F', "F'", 'L', "L'", 'D', "D'", 'B', "B'"]);
    expect([name(';'), name('a'), name('t'), name('b')]).toEqual(['y', "y'", 'x', "x'"]);
  });

  it('ignores case, shortcuts and typing in fields', () => {
    expect(name('I')).toBe('R');
    expect(press('i', { ctrlKey: true })).toBeNull();
    expect(press('i', { metaKey: true })).toBeNull();
    expect(press('i', { target: { tagName: 'INPUT' } as unknown as EventTarget })).toBeNull();
    expect(press('q', { target: { tagName: 'DIV' } as unknown as EventTarget })).not.toBeNull();
    expect(press('Enter')).toBeNull();
  });

  it('every mapped key parses and sits on the drawn keyboard', () => {
    const drawn = KEY_ROWS.join('');
    for (const [key, notation] of Object.entries(KEYMAP)) {
      expect(drawn).toContain(key);
      expect(() => parseMove(notation)).not.toThrow();
    }
  });

  it('every face turn and its inverse has a key', () => {
    for (const face of ['R', 'U', 'F', 'L', 'D', 'B']) {
      const move = parseMove(face);
      for (const m of [move, invertMove(move)]) {
        const key = keyFor(m)!;
        expect(movesEqual(press(key.toLowerCase())!, m)).toBe(true);
      }
    }
    expect(keyFor(parseMove('R2'))).toBe('I I');
  });
});
