import type { ThemeId } from '@cuberush/api';

/** Colors a theme sets. Panels stay dark in every theme so text and chart colors keep contrast. */
export interface ThemeTokens {
  /** Page background and the glow behind the cube. */
  bg: string;
  bgGlow: string;
  /** Translucent panels over the scene, and the solid surface used for cards and the chart. */
  panel: string;
  surface: string;
  accent: string;
  /** Text on accent-colored buttons. */
  accentText: string;
  text: string;
  muted: string;
}

const TEXT = '#eef0f7';
const MUTED = '#9aa0b5';

export const THEME_TOKENS: Readonly<Record<ThemeId, ThemeTokens>> = {
  midnight: {
    bg: '#0d0f17',
    bgGlow: '#1b2140',
    panel: 'rgba(20, 23, 36, 0.82)',
    surface: '#151827',
    accent: '#ffd23f',
    accentText: '#1a1400',
    text: TEXT,
    muted: MUTED,
  },
  ocean: {
    bg: '#06141b',
    bgGlow: '#0d3a4a',
    panel: 'rgba(10, 32, 42, 0.82)',
    surface: '#0f2630',
    accent: '#3ee0c8',
    accentText: '#00241f',
    text: TEXT,
    muted: '#9db4bd',
  },
  sunset: {
    bg: '#1a0d1c',
    bgGlow: '#5a2140',
    panel: 'rgba(40, 18, 38, 0.82)',
    surface: '#2a1428',
    accent: '#ff9f5a',
    accentText: '#2a1000',
    text: TEXT,
    muted: '#c0a3b6',
  },
  forest: {
    bg: '#08140c',
    bgGlow: '#18402a',
    panel: 'rgba(16, 36, 24, 0.82)',
    surface: '#12261a',
    accent: '#a6e25b',
    accentText: '#142400',
    text: TEXT,
    muted: '#a0b8a6',
  },
  royal: {
    bg: '#120c22',
    bgGlow: '#3a2470',
    panel: 'rgba(30, 20, 56, 0.82)',
    surface: '#1e1438',
    accent: '#f2c14e',
    accentText: '#241800',
    text: TEXT,
    muted: '#ada3c8',
  },
};

/** Sets the theme's CSS variables on <html>; every component already reads them. */
export function applyTheme(id: ThemeId): void {
  const t = THEME_TOKENS[id];
  const style = document.documentElement.style;
  style.setProperty('--bg', t.bg);
  style.setProperty('--bg-glow', t.bgGlow);
  style.setProperty('--panel', t.panel);
  style.setProperty('--surface', t.surface);
  style.setProperty('--accent', t.accent);
  style.setProperty('--accent-text', t.accentText);
  style.setProperty('--text', t.text);
  style.setProperty('--muted', t.muted);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
}

/** WCAG relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two #rrggbb colors (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
