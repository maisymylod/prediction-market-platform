import { eq } from 'drizzle-orm';
import {
  NOTIFY_CHANNELS,
  WIRE_VERSION,
  type PriceNotify,
  type PriceSource,
  type VenueName,
} from '@pmp/core';
import { priceSnapshots, ingestionRuns, publish } from '@pmp/db';
import { db, sql } from './db.js';
import { log } from './config.js';

const p4 = (x: number | null): string | null => (x === null ? null : x.toFixed(4));

export interface Tick {
  marketId: number;
  venue: VenueName;
  yesBid: number | null;
  yesAsk: number | null;
  mark: number | null;
  /** Epoch ms. */
  ts: number;
  source: PriceSource;
}

/**
 * The single write+publish path for ALL price updates (simulator, Kalshi,
 * Polymarket, reconciliation). Appends a price_snapshots row, then issues a
 * Postgres NOTIFY that the SSE route fans out to browsers.
 */
export async function emitTick(tick: Tick): Promise<void> {
  const tsDate = new Date(tick.ts);
  await db.insert(priceSnapshots).values({
    marketId: tick.marketId,
    yesBid: p4(tick.yesBid),
    yesAsk: p4(tick.yesAsk),
    mark: p4(tick.mark),
    ts: tsDate,
    source: tick.source,
  });

  const payload: PriceNotify = {
    v: WIRE_VERSION,
    marketId: String(tick.marketId),
    venue: tick.venue,
    mark: tick.mark,
    yesBid: tick.yesBid,
    yesAsk: tick.yesAsk,
    ts: tsDate.toISOString(),
    source: tick.source,
  };
  await publish(sql, NOTIFY_CHANNELS.price, payload);
}

// --- ingestion run audit trail ---------------------------------------------
export async function startRun(
  kind: 'ws' | 'poll' | 'reconcile' | 'sim',
  venue?: VenueName,
): Promise<number> {
  const [row] = await db
    .insert(ingestionRuns)
    .values({ kind, venue: venue ?? null, status: 'running' })
    .returning({ id: ingestionRuns.id });
  return row!.id;
}

export async function finishRun(
  id: number,
  result: { rowsWritten: number; errorCount: number; errorDetail?: unknown },
): Promise<void> {
  await db
    .update(ingestionRuns)
    .set({
      finishedAt: new Date(),
      rowsWritten: result.rowsWritten,
      errorCount: result.errorCount,
      errorDetail: result.errorDetail ? (result.errorDetail as object) : null,
      status: result.errorCount > 0 ? 'error' : 'ok',
    })
    .where(eq(ingestionRuns.id, id));
  log.debug('ingestion run finished', { id, ...result, errorDetail: undefined });
}
