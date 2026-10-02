import type { ThemeId } from '@cuberush/api';
import { THEME_TOKENS } from './themes';

/** The page background and accent of a theme, as a preview. */
export function ThemeChip({ theme }: { theme: ThemeId }) {
  const t = THEME_TOKENS[theme];
  return (
    <span
      className="theme-chip"
      style={{ background: `radial-gradient(circle at 50% 40%, ${t.bgGlow}, ${t.bg} 75%)` }}
      aria-hidden
    >
      <span style={{ background: t.accent }} />
    </span>
  );
}
