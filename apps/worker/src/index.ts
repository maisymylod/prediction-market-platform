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
import { startRun, finishRun } from './publisher.js';

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

  // Live venue ingestion lands in steps 5 (Kalshi) and 6 (Polymarket). Until a
  // live source is active, the simulator drives the exact same NOTIFY path.
  if (env.USE_KALSHI_LIVE) log.warn('USE_KALSHI_LIVE set — Kalshi live ingestion arrives in step 5; using simulator');
  if (env.USE_POLYMARKET_LIVE) log.warn('USE_POLYMARKET_LIVE set — Polymarket ingestion arrives in step 6; using simulator');

  let simulator: PriceSimulator | null = null;
  let simRunId: number | null = null;
  let reconcileTimer: ReturnType<typeof setInterval> | null = null;

  if (env.USE_PRICE_SIMULATOR) {
    simulator = new PriceSimulator(markets, feed, { tickMs: env.SIMULATOR_TICK_MS });
    simRunId = await startRun('sim');
    simulator.start();

    // Periodic full reconciliation: the correctness backstop for missed ticks.
    reconcileTimer = setInterval(() => {
      void (async () => {
        const runId = await startRun('reconcile');
        try {
          const rows = await simulator!.reconcile();
          await finishRun(runId, { rowsWritten: rows, errorCount: 0 });
          log.debug('reconciliation complete', { rows });
        } catch (err) {
          await finishRun(runId, { rowsWritten: 0, errorCount: 1, errorDetail: { message: (err as Error).message } });
        }
      })();
    }, env.RECONCILE_INTERVAL_MS);
  } else {
    log.warn('no active price source (simulator off and no live venue wired)');
  }

  // --- graceful shutdown ---
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutting down', { signal });
    if (reconcileTimer) clearInterval(reconcileTimer);
    simulator?.stop();
    feed.stop();
    await feed.markAllDown();
    if (simRunId !== null) await finishRun(simRunId, { rowsWritten: 0, errorCount: 0 });
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
