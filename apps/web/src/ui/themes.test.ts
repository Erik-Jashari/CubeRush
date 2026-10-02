import { THEMES } from '@cuberush/api';
import { describe, expect, it } from 'vitest';
import { contrast, THEME_TOKENS } from './themes';

describe('contrast', () => {
  it('matches known WCAG values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('themes', () => {
  it('defines tokens for every theme in the shop', () => {
    expect(Object.keys(THEME_TOKENS).sort()).toEqual(THEMES.map((t) => t.id).sort());
  });

  for (const [id, t] of Object.entries(THEME_TOKENS)) {
    it(`${id}: text is readable on its surface and buttons`, () => {
      expect(contrast(t.text, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.muted, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accentText, t.accent)).toBeGreaterThanOrEqual(4.5);
      // The accent is also used for text and outlines on the surface.
      expect(contrast(t.accent, t.surface)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
