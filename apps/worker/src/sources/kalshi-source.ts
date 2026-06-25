import {
  RateLimitedClient,
  KalshiRestClient,
  KalshiWsClient,
  makeKalshiSigner,
  mapRestMarket,
  type KalshiSigner,
} from '@pmp/venues';
import { VENUE_CHANNEL, type FeedMonitor } from '../feeds.js';
import { emitTick } from '../publisher.js';
import { env, log } from '../config.js';
import type { SimMarket } from '../simulator.js';

const CHANNEL = VENUE_CHANNEL.kalshi; // 'ticker'

/**
 * Read-only Kalshi ingestion: a resilient market-data WebSocket plus a REST
 * reconciliation pass, both through the centralized signed/rate-limited clients.
 * Emits ticks via the SAME emitTick NOTIFY path as the simulator.
 */
export class KalshiSource {
  private readonly tickerToId = new Map<string, number>();
  private readonly tickers: string[];
  private readonly rest: KalshiRestClient;
  private readonly ws: KalshiWsClient;

  static create(markets: SimMarket[], feed: FeedMonitor): KalshiSource | null {
    const signer = makeKalshiSigner({
      keyId: env.KALSHI_API_KEY_ID,
      privateKeyPem: env.KALSHI_PRIVATE_KEY,
      privateKeyPath: env.KALSHI_PRIVATE_KEY_PATH,
    });
    if (!signer) {
      log.warn('Kalshi creds absent — cannot open authenticated market-data WS; falling back to simulator');
      return null;
    }
    return new KalshiSource(markets, feed, signer);
  }

  private constructor(
    markets: SimMarket[],
    private readonly feed: FeedMonitor,
    signer: KalshiSigner,
  ) {
    this.tickers = markets.map((m) => m.externalTicker);
    for (const m of markets) this.tickerToId.set(m.externalTicker, m.marketId);
    this.feed.track('kalshi', CHANNEL);

    const http = new RateLimitedClient({ ratePerSec: 8, logger: log });
    this.rest = new KalshiRestClient(env.KALSHI_API_BASE, http, signer);
    this.ws = new KalshiWsClient({
      url: env.KALSHI_WS_URL,
      signer,
      marketTickers: this.tickers,
      onTick: (tick) => {
        const marketId = this.tickerToId.get(tick.externalTicker);
        if (marketId === undefined) return;
        this.feed.touch('kalshi', CHANNEL, tick.tsMs);
        void emitTick({
          marketId,
          venue: 'kalshi',
          yesBid: tick.yesBid,
          yesAsk: tick.yesAsk,
          mark: tick.mark,
          ts: tick.tsMs,
          source: 'live',
        }).catch((err) => log.error('kalshi emit failed', { error: (err as Error).message }));
      },
      onState: (state) => {
        if (state !== 'live') this.feed.signalState('kalshi', CHANNEL, state);
      },
      logger: log,
    });
  }

  start(): void {
    this.ws.start();
    log.info('kalshi source started', { tickers: this.tickers.length });
  }

  stop(): void {
    this.ws.stop();
  }

  /** REST reconciliation: refetch public market data and re-emit current marks. */
  async reconcile(): Promise<number> {
    let rows = 0;
    try {
      const res = await this.rest.getMarkets({ tickers: this.tickers.join(',') });
      for (const m of res.markets) {
        const marketId = this.tickerToId.get(m.ticker);
        if (marketId === undefined) continue;
        const n = mapRestMarket(m);
        await emitTick({
          marketId,
          venue: 'kalshi',
          yesBid: n.yesBid,
          yesAsk: n.yesAsk,
          mark: n.mark,
          ts: Date.now(),
          source: 'reconcile',
        });
        this.feed.touch('kalshi', CHANNEL);
        rows += 1;
      }
    } catch (err) {
      log.error('kalshi reconcile failed', { error: (err as Error).message });
    }
    return rows;
  }
}
