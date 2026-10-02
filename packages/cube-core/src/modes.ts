/** Every way to play. Client and server share these ids. */
export type ModeId = 'quick' | 'daily' | 'challenge' | 'blindfold' | 'survival';

export const MODE_IDS: readonly ModeId[] = ['quick', 'daily', 'challenge', 'blindfold', 'survival'];

/** How long a blindfold scramble is shown before the stickers go blank and the timer starts. */
export const BLINDFOLD_MEMORIZE_MS = 10_000;

/** Points multiplier for a finished solve. Blindfold pays double unless the player peeked. */
export function modeMultiplier(mode: ModeId, options: { peeked?: boolean } = {}): number {
  return mode === 'blindfold' && !options.peeked ? 2 : 1;
}
