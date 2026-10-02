import type { GameMode } from '../game/store';

/** How each mode is named and pitched in the menus. */
export const MODE_INFO: Record<GameMode, { name: string; blurb: string }> = {
  quick: { name: 'Quick play', blurb: 'A fresh random scramble' },
  daily: { name: 'Daily scramble', blurb: 'Same cube for everyone' },
  challenge: { name: 'Challenge', blurb: 'Race a friend’s solve' },
  blindfold: { name: 'Blindfold', blurb: '10 s to memorize · ×2 points' },
  survival: { name: 'Survival', blurb: 'Waves every 20 s · 3 lives' },
};
