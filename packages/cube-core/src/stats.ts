/**
 * Speedcubing averages. An "average of N" drops the single best and worst time, then takes the
 * mean of the rest, so one lucky or disastrous solve doesn't dominate it.
 */
export function trimmedMean(times: readonly number[]): number | null {
  if (times.length < 3) return null;
  const sorted = [...times].sort((a, b) => a - b);
  const middle = sorted.slice(1, -1);
  return middle.reduce((sum, t) => sum + t, 0) / middle.length;
}

/** Average of the most recent `n` times (oldest first), or null with fewer than `n`. */
export function currentAverage(times: readonly number[], n: number): number | null {
  return times.length < n ? null : trimmedMean(times.slice(-n));
}

/** The average of `n` ending at each solve; null until there are `n` solves. */
export function rollingAverages(times: readonly number[], n: number): (number | null)[] {
  return times.map((_, i) => (i + 1 < n ? null : trimmedMean(times.slice(i + 1 - n, i + 1))));
}

/** Best average of `n` consecutive solves. */
export function bestAverage(times: readonly number[], n: number): number | null {
  const averages = rollingAverages(times, n).filter((a): a is number => a !== null);
  return averages.length === 0 ? null : Math.min(...averages);
}

export interface SolveStats {
  count: number;
  best: number | null;
  mean: number | null;
  ao5: number | null;
  ao12: number | null;
  bestAo5: number | null;
  bestAo12: number | null;
}

/** Summary of a list of solve times, oldest first. */
export function summarizeTimes(times: readonly number[]): SolveStats {
  return {
    count: times.length,
    best: times.length === 0 ? null : Math.min(...times),
    mean: times.length === 0 ? null : times.reduce((s, t) => s + t, 0) / times.length,
    ao5: currentAverage(times, 5),
    ao12: currentAverage(times, 12),
    bestAo5: bestAverage(times, 5),
    bestAo12: bestAverage(times, 12),
  };
}
