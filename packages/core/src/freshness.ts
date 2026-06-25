// Pure freshness + idempotency rules shared by the worker's feed monitor and the
// browser's live update logic. No I/O, clock passed in.

export type Freshness = 'live' | 'stale' | 'down';

/**
 * Apply an incoming update only if it is strictly newer than what we hold.
 * Makes streaming idempotent and order-insensitive (keyed by id + ts upstream).
 */
export function shouldApplyUpdate(incomingTs: number, existingTs: number | undefined): boolean {
  return existingTs === undefined || incomingTs > existingTs;
}

/** True when a feed/mark has been silent longer than the stale threshold. */
export function isStale(lastMessageAt: number | null, now: number, thresholdMs: number): boolean {
  if (lastMessageAt === null) return true;
  return now - lastMessageAt > thresholdMs;
}

/**
 * Classify a feed: `down` if never seen (or past an optional hard cutoff),
 * `stale` past the stale threshold, else `live`.
 */
export function freshnessFor(
  lastMessageAt: number | null,
  now: number,
  staleThresholdMs: number,
  downThresholdMs?: number,
): Freshness {
  if (lastMessageAt === null) return 'down';
  const age = now - lastMessageAt;
  if (downThresholdMs !== undefined && age > downThresholdMs) return 'down';
  return age > staleThresholdMs ? 'stale' : 'live';
}
