import { describe, expect, it } from 'vitest';
import { dailySeed, NICKNAME_PATTERN, utcDateKey } from './index';

describe('utcDateKey', () => {
  it('uses the UTC date, not the local one', () => {
    expect(utcDateKey(new Date('2026-10-02T23:30:00-05:00'))).toBe('2026-10-03');
  });
});

describe('dailySeed', () => {
  it('derives the seed from the date', () => {
    expect(dailySeed('2026-10-02')).toBe('daily-2026-10-02');
  });
});

describe('NICKNAME_PATTERN', () => {
  it('allows 3-20 letters, digits, _ and -', () => {
    for (const ok of ['abc', 'Speedy_Cuber-99', 'x'.repeat(20)])
      expect(NICKNAME_PATTERN.test(ok)).toBe(true);
    for (const bad of ['ab', 'x'.repeat(21), 'has space', 'émile', '<b>']) {
      expect(NICKNAME_PATTERN.test(bad)).toBe(false);
    }
  });
});
