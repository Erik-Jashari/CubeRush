import { ACHIEVEMENTS, type AchievementDto, type AchievementId } from '@cuberush/api';

/** Everything achievements are judged on, read from the player's verified solves. */
export interface PlayerFacts {
  /** Finished solves of any kind except survival runs. */
  solves: number;
  bestMs: number | null;
  fewestMoves: number | null;
  solvesWithoutUndo: number;
  longestStreak: number;
  mostWaves: number;
  blindWithoutPeek: boolean;
  beatAChallenge: boolean;
  /** Skins and themes bought. */
  unlocks: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Longest run of consecutive days in a set of `YYYY-MM-DD` dates. */
export function longestStreak(days: Iterable<string>): number {
  const stamps = [...new Set(days)].map((d) => Date.parse(`${d}T00:00:00Z`)).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < stamps.length; i++) {
    run = i > 0 && stamps[i]! - stamps[i - 1]! === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** Whether each achievement is earned, plus progress for the counted ones. */
const RULES: Record<AchievementId, (f: PlayerFacts) => { done: boolean; progress?: number }> = {
  'first-solve': (f) => ({ done: f.solves > 0 }),
  'sub-60': (f) => ({ done: f.bestMs !== null && f.bestMs < 60_000 }),
  'sub-30': (f) => ({ done: f.bestMs !== null && f.bestMs < 30_000 }),
  efficient: (f) => ({ done: f.fewestMoves !== null && f.fewestMoves <= 50 }),
  'clean-10': (f) => ({ done: f.solvesWithoutUndo >= 10, progress: f.solvesWithoutUndo }),
  'streak-3': (f) => ({ done: f.longestStreak >= 3, progress: f.longestStreak }),
  'streak-10': (f) => ({ done: f.longestStreak >= 10, progress: f.longestStreak }),
  survivor: (f) => ({ done: f.mostWaves >= 5, progress: f.mostWaves }),
  blind: (f) => ({ done: f.blindWithoutPeek }),
  challenger: (f) => ({ done: f.beatAChallenge }),
  collector: (f) => ({ done: f.unlocks > 0 }),
};

export function evaluateAchievements(facts: PlayerFacts): AchievementDto[] {
  return ACHIEVEMENTS.map(({ id, target }) => {
    const { done, progress } = RULES[id](facts);
    return {
      id,
      unlocked: done,
      progress: target === undefined ? null : Math.min(progress ?? 0, target),
    };
  });
}

export function unlockedIds(achievements: readonly AchievementDto[]): Set<AchievementId> {
  return new Set(achievements.filter((a) => a.unlocked).map((a) => a.id));
}
