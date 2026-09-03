/** Diziye geçmiş eklense bile stop kontrolü değişmez mum zamanını izler. */
export function pendingReplayBars<T extends { time: number }>(
  bars: T[], currentIndex: number, entryTime: string | null,
  entryIndex: number | null, lastCheckedTime: number | null,
): { bar: T; index: number }[] {
  const entryTimestamp = entryTime ? Date.parse(entryTime) / 1000 : null;
  return bars.slice(0, currentIndex + 1)
    .map((bar, index) => ({ bar, index }))
    .filter(({ bar, index }) =>
      (entryTimestamp !== null ? bar.time > entryTimestamp : index > (entryIndex ?? -1))
      && (lastCheckedTime === null || bar.time > lastCheckedTime))
    .slice(0, 5000);
}
