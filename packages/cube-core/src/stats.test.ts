import { describe, expect, it } from 'vitest';
import {
  bestAverage,
  currentAverage,
  rollingAverages,
  summarizeTimes,
  trimmedMean,
} from './stats.js';

describe('averages', () => {
  it('drops the best and worst time', () => {
    // Middle three of [10, 12, 14, 16, 90] are 12, 14, 16.
    expect(trimmedMean([14, 90, 10, 16, 12])).toBe(14);
    expect(trimmedMean([1, 2])).toBeNull();
  });

  it('computes Ao5 and Ao12 from the latest solves', () => {
    const times = [30, 20, 25, 22, 24, 21, 23];
    // Last five are 25 22 24 21 23; dropping 21 and 25 leaves 22, 23, 24.
    expect(currentAverage(times, 5)).toBe(23);
    expect(currentAverage(times, 12)).toBeNull();
    const twelve = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 100];
    // Drops 10 and 100; mean of 11..20 is 15.5.
    expect(currentAverage(twelve, 12)).toBe(15.5);
  });

  it('tracks rolling and best averages', () => {
    const times = [50, 40, 30, 20, 10, 60];
    expect(rollingAverages(times, 5)).toEqual([null, null, null, null, 30, 30]);
    expect(bestAverage([50, 40, 30, 20, 10, 5, 4], 5)).toBe(Math.min(30, 20, (10 + 20 + 5) / 3));
    expect(bestAverage([1, 2], 5)).toBeNull();
  });

  it('summarizes a session', () => {
    expect(summarizeTimes([])).toEqual({
      count: 0,
      best: null,
      mean: null,
      ao5: null,
      ao12: null,
      bestAo5: null,
      bestAo12: null,
    });
    expect(summarizeTimes([30, 20, 25, 22, 24])).toMatchObject({
      count: 5,
      best: 20,
      mean: 24.2,
      ao5: (22 + 24 + 25) / 3,
    });
  });
});
