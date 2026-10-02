/** Formats milliseconds as `ss.cc` under a minute and `m:ss.cc` above it. */
export function formatTime(ms: number): string {
  const totalCentis = Math.floor(Math.max(0, ms) / 10);
  const centis = totalCentis % 100;
  const totalSeconds = Math.floor(totalCentis / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const cc = String(centis).padStart(2, '0');
  if (minutes === 0) return `${seconds}.${cc}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${cc}`;
}

/** Today's UTC date as `YYYY-MM-DD`, the key for the daily scramble. */
export function utcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
