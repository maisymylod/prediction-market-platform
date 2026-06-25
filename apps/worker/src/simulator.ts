import type { VenueName } from '@pmp/core';
import { emitTick, type Tick } from './publisher.js';
import { FeedMonitor, VENUE_CHANNEL } from './feeds.js';
import { log } from './config.js';

export interface SimMarket {
  marketId: number;
  venue: VenueName;
  externalTicker: string;
  mark: number;
}

const clamp = (x: number, lo = 0.02, hi = 0.98) => Math.min(hi, Math.max(lo, x));

/**
 * Random-walk price simulator. Emits realistic ticks through the SAME emitTick
 * NOTIFY path as real feeds, proving the real-time pipeline offline with no
 * keys. Enabled by USE_PRICE_SIMULATOR (default on when no live keys present).
 */
export class PriceSimulator {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly markets: SimMarket[],
    private readonly feed: FeedMonitor,
    private readonly opts: {
      tickMs: number;
      volatility?: number;
      spread?: number;
      rng?: () => number;
    },
  ) {
    for (const m of markets) this.feed.track(m.venue, VENUE_CHANNEL[m.venue]);
  }

  private step(m: SimMarket): Tick {
    const rng = this.opts.rng ?? Math.random;
    const vol = this.opts.volatility ?? 0.012;
    const spread = this.opts.spread ?? 0.012;
    m.mark = clamp(m.mark + (rng() * 2 - 1) * vol);
    const ts = Date.now();
    return {
      marketId: m.marketId,
      venue: m.venue,
      mark: m.mark,
      yesBid: clamp(m.mark - spread / 2),
      yesAsk: clamp(m.mark + spread / 2),
      ts,
      source: 'sim',
    };
  }

  private async tickOnce(): Promise<void> {
    for (const m of this.markets) {
      const tick = this.step(m);
      this.feed.touch(m.venue, VENUE_CHANNEL[m.venue], tick.ts);
      try {
        await emitTick(tick);
      } catch (err) {
        log.error('simulator emit failed', { marketId: m.marketId, error: (err as Error).message });
      }
    }
  }

  /** Re-emit current marks as a reconciliation snapshot (source 'reconcile'). */
  async reconcile(): Promise<number> {
    let rows = 0;
    for (const m of this.markets) {
      try {
        await emitTick({
          marketId: m.marketId,
          venue: m.venue,
          mark: m.mark,
          yesBid: clamp(m.mark - 0.006),
          yesAsk: clamp(m.mark + 0.006),
          ts: Date.now(),
          source: 'reconcile',
        });
        rows += 1;
      } catch (err) {
        log.error('simulator reconcile failed', { marketId: m.marketId, error: (err as Error).message });
      }
    }
    return rows;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tickOnce(), this.opts.tickMs);
    log.info('price simulator started', { markets: this.markets.length, tickMs: this.opts.tickMs });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
