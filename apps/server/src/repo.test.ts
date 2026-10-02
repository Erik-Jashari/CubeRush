import { describe, expect, it } from 'vitest';
import { currentStreak, streakLength } from './repo';

describe('streaks', () => {
  const days = new Set(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);

  it('counts consecutive days back from a day', () => {
    expect(streakLength(days, '2026-10-02')).toBe(4);
    expect(streakLength(days, '2026-09-30')).toBe(2);
    expect(streakLength(days, '2026-10-05')).toBe(0);
  });

  it('crosses month boundaries', () => {
    expect(streakLength(new Set(['2026-09-30', '2026-10-01']), '2026-10-01')).toBe(2);
  });

  it('stays alive today until the player misses a whole day', () => {
    expect(currentStreak(days, '2026-10-02')).toBe(4);
    expect(currentStreak(days, '2026-10-03')).toBe(4);
    expect(currentStreak(days, '2026-10-04')).toBe(0);
  });
});
