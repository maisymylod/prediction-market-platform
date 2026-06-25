import type { VenueName } from '@pmp/core';
import {
  venues as venuesTable,
  markets as marketsTable,
  positions as positionsTable,
  eventLinkMarkets as eventLinkMarketsTable,
  latestSnapshots,
} from '@pmp/db';
import { env, log } from './config.js';
import { db, handle } from './db.js';
import { FeedMonitor } from './feeds.js';
import { PriceSimulator, type SimMarket } from './simulator.js';
import { KalshiSource } from './sources/kalshi-source.js';
import { startRun, finishRun } from './publisher.js';

/** A price source the worker drives + reconciles + shuts down uniformly. */
interface IngestionSource {
  stop: () => void | Promise<void>;
  reconcile: () => Promise<number>;
}

/** Markets the user holds positions in OR is watching (in any link). */
async function watchedMarkets(): Promise<SimMarket[]> {
  const [venueRows, marketRows, posMarketIds, linkMarketIds, snaps] = await Promise.all([
    db.select().from(venuesTable),
    db.select().from(marketsTable),
    db.selectDistinct({ marketId: positionsTable.marketId }).from(positionsTable),
    db.selectDistinct({ marketId: eventLinkMarketsTable.marketId }).from(eventLinkMarketsTable),
    latestSnapshots(db),
  ]);

  const venueName = new Map<number, VenueName>(venueRows.map((v) => [v.id, v.name]));
  const marketById = new Map(marketRows.map((m) => [m.id, m]));
  const markById = new Map(snaps.map((s) => [s.marketId, s.mark ? Number(s.mark) : null]));

  const ids = new Set<number>([
    ...posMarketIds.map((r) => r.marketId),
    ...linkMarketIds.map((r) => r.marketId),
  ]);

  const result: SimMarket[] = [];
  for (const id of ids) {
    const market = marketById.get(id);
    if (!market) continue;
    result.push({
      marketId: id,
      venue: venueName.get(market.venueId) ?? 'kalshi',
      externalTicker: market.externalTicker,
      mark: markById.get(id) ?? 0.5,
    });
  }
  return result;
}

async function main() {
  log.info('worker starting', {
    simulator: env.USE_PRICE_SIMULATOR,
    kalshiLive: env.USE_KALSHI_LIVE,
    polymarketLive: env.USE_POLYMARKET_LIVE,
    reconcileMs: env.RECONCILE_INTERVAL_MS,
    staleMs: env.STALE_THRESHOLD_MS,
  });

  const markets = await watchedMarkets();
  log.info('watched markets resolved', { count: markets.length });

  const feed = new FeedMonitor(env.STALE_THRESHOLD_MS);
  feed.start();

  const sources: IngestionSource[] = [];
  const liveCovered = new Set<number>();

  // --- Kalshi live (step 5): authenticated market-data WS + REST reconcile ---
  if (env.USE_KALSHI_LIVE) {
    const kalshiMarkets = markets.filter((m) => m.venue === 'kalshi');
    const ks = KalshiSource.create(kalshiMarkets, feed);
    if (ks) {
      ks.start();
      sources.push(ks);
      for (const m of kalshiMarkets) liveCovered.add(m.marketId);
    }
  }

  // Polymarket live ingestion arrives in step 6.
  if (env.USE_POLYMARKET_LIVE) log.warn('USE_POLYMARKET_LIVE set — Polymarket ingestion arrives in step 6; using simulator');

  // --- Simulator drives every market NOT covered by a live source ---
  if (env.USE_PRICE_SIMULATOR) {
    const simMarkets = markets.filter((m) => !liveCovered.has(m.marketId));
    if (simMarkets.length > 0) {
      const sim = new PriceSimulator(simMarkets, feed, { tickMs: env.SIMULATOR_TICK_MS });
      sim.start();
      sources.push(sim);
    } else {
      log.info('all watched markets covered by live sources; simulator idle');
    }
  } else if (sources.length === 0) {
    log.warn('no active price source (simulator off and no live venue connected)');
  }

  // --- Periodic full reconciliation across all sources (correctness backstop) ---
  const reconcileTimer = setInterval(() => {
    void (async () => {
      const runId = await startRun('reconcile');
      try {
        const counts = await Promise.all(sources.map((s) => s.reconcile()));
        const rows = counts.reduce((a, b) => a + b, 0);
        await finishRun(runId, { rowsWritten: rows, errorCount: 0 });
        log.debug('reconciliation complete', { rows });
      } catch (err) {
        await finishRun(runId, { rowsWritten: 0, errorCount: 1, errorDetail: { message: (err as Error).message } });
      }
    })();
  }, env.RECONCILE_INTERVAL_MS);

  // --- graceful shutdown ---
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutting down', { signal });
    clearInterval(reconcileTimer);
    for (const s of sources) await s.stop();
    feed.stop();
    await feed.markAllDown();
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error('worker fatal', { error: (err as Error).message });
  process.exit(1);
});
