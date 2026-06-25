import { backoffDelay, sleep, type Logger } from '@pmp/core';

// ---------------------------------------------------------------------------
// Centralized outbound HTTP client (constraint #4). EVERY venue REST call goes
// through here so we honor rate limits and ToS uniformly: a token-bucket rate
// limiter plus retry on 429/5xx with exponential backoff and full jitter.
// ---------------------------------------------------------------------------

export interface RateLimitedClientOptions {
  /** Sustained requests per second. */
  ratePerSec: number;
  /** Bucket capacity (burst). Defaults to ratePerSec. */
  burst?: number;
  /** Max retry attempts on retryable status/network errors. */
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  logger?: Logger;
  /** Injectable clock (ms) for testing. */
  now?: () => number;
}

class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: () => number,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  /** Resolve once a token is available, refilling continuously. */
  async take(): Promise<void> {
    for (;;) {
      const t = this.now();
      const elapsed = (t - this.last) / 1000;
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
      this.last = t;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const deficit = 1 - this.tokens;
      await sleep(Math.ceil((deficit / this.refillPerSec) * 1000));
    }
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class RateLimitedClient {
  private readonly bucket: TokenBucket;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly logger?: Logger;

  constructor(private readonly opts: RateLimitedClientOptions) {
    const now = opts.now ?? (() => Date.now());
    this.bucket = new TokenBucket(opts.burst ?? opts.ratePerSec, opts.ratePerSec, now);
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseBackoffMs = opts.baseBackoffMs ?? 500;
    this.maxBackoffMs = opts.maxBackoffMs ?? 20_000;
    this.logger = opts.logger;
  }

  /** Rate-limited fetch with retry/backoff. Returns the final Response. */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    let attempt = 0;
    for (;;) {
      await this.bucket.take();
      try {
        const res = await fetch(url, init);
        if (RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries) {
          const wait = this.retryAfter(res) ?? backoffDelay(attempt, {
            baseMs: this.baseBackoffMs,
            maxMs: this.maxBackoffMs,
          });
          this.logger?.warn('http retryable status', { url, status: res.status, attempt, wait });
          await sleep(wait);
          attempt += 1;
          continue;
        }
        return res;
      } catch (err) {
        if (attempt >= this.maxRetries) throw err;
        const wait = backoffDelay(attempt, { baseMs: this.baseBackoffMs, maxMs: this.maxBackoffMs });
        this.logger?.warn('http network error, retrying', {
          url,
          attempt,
          wait,
          error: (err as Error).message,
        });
        await sleep(wait);
        attempt += 1;
      }
    }
  }

  /** Rate-limited JSON GET with a runtime validator (Zod `.parse`). */
  async getJson<T>(url: string, parse: (data: unknown) => T, init: RequestInit = {}): Promise<T> {
    const res = await this.fetch(url, { ...init, method: 'GET' });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
    const data: unknown = await res.json();
    return parse(data);
  }

  private retryAfter(res: Response): number | null {
    const header = res.headers.get('retry-after');
    if (!header) return null;
    const secs = Number(header);
    if (Number.isFinite(secs)) return Math.min(this.maxBackoffMs, secs * 1000);
    return null;
  }
}
