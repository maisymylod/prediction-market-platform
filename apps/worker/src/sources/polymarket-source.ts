import { RateLimitedClient, PolymarketClient } from '@pmp/venues';
import { VENUE_CHANNEL, type FeedMonitor } from '../feeds.js';
import { emitTick } from '../publisher.js';
import { env, log } from '../config.js';
import type { SimMarket } from '../simulator.js';

const CHANNEL = VENUE_CHANNEL.polymarket; // 'poll'

/**
 * Read-only Polymarket ingestion: polls the public CLOB price API on an interval
 * (no equivalent stream in v1). Emits ticks through the same emitTick NOTIFY
 * path. The market's externalTicker is the CLOB YES-token id.
 */
export class PolymarketSource {
  private readonly client: PolymarketClient;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly markets: SimMarket[],
    private readonly feed: FeedMonitor,
  ) {
    const http = new RateLimitedClient({ ratePerSec: 4, logger: log });
    this.client = new PolymarketClient(env.POLYMARKET_CLOB_BASE, http);
    this.feed.track('polymarket', CHANNEL);
  }

  private async poll(source: 'live' | 'reconcile'): Promise<number> {
    let rows = 0;
    for (const m of this.markets) {
      const quote = await this.client.getQuote(m.externalTicker);
      if (quote.mark === null && quote.yesBid === null && quote.yesAsk === null) continue;
      const ts = Date.now();
      this.feed.touch('polymarket', CHANNEL, ts);
      try {
        await emitTick({ marketId: m.marketId, venue: 'polymarket', ...quote, ts, source });
        rows += 1;
      } catch (err) {
        log.error('polymarket emit failed', { marketId: m.marketId, error: (err as Error).message });
      }
    }
    return rows;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll('live'), env.POLL_INTERVAL_MS);
    log.info('polymarket source started', { markets: this.markets.length, pollMs: env.POLL_INTERVAL_MS });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  reconcile(): Promise<number> {
    return this.poll('reconcile');
  }
}
