import { describe, expect, it } from 'vitest';
import { formatTime, utcDateKey } from './time';

describe('formatTime', () => {
  it('shows seconds and centiseconds under a minute', () => {
    expect(formatTime(0)).toBe('0.00');
    expect(formatTime(9_876)).toBe('9.87');
    expect(formatTime(59_999)).toBe('59.99');
  });

  it('adds minutes above a minute', () => {
    expect(formatTime(60_000)).toBe('1:00.00');
    expect(formatTime(125_430)).toBe('2:05.43');
  });

  it('clamps negative values', () => {
    expect(formatTime(-5)).toBe('0.00');
  });
});

describe('utcDateKey', () => {
  it('uses the UTC date', () => {
    expect(utcDateKey(new Date('2026-10-02T23:30:00-05:00'))).toBe('2026-10-03');
  });
});
