// Exponential backoff with full jitter, capped. Used by the rate-limited HTTP
// client and by every WebSocket reconnect loop. `rng` is injectable so tests
// are deterministic.

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  factor?: number;
  /** Returns a value in [0,1). Defaults to Math.random. */
  rng?: () => number;
}

/**
 * Delay (ms) for a given attempt (0-based) using full jitter:
 *   sleep = random(0, min(maxMs, baseMs * factor^attempt))
 * Full jitter avoids thundering-herd reconnect storms.
 */
export function backoffDelay(attempt: number, opts: BackoffOptions = {}): number {
  const { baseMs = 500, maxMs = 30_000, factor = 2, rng = Math.random } = opts;
  const ceiling = Math.min(maxMs, baseMs * Math.pow(factor, Math.max(0, attempt)));
  return Math.floor(rng() * ceiling);
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
