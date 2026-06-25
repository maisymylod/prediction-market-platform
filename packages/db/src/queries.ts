import { desc } from 'drizzle-orm';
import type { Db } from './client.js';
import { priceSnapshots, type PriceSnapshotRow } from './schema.js';

/**
 * Latest snapshot per market via DISTINCT ON — cheap with the
 * (market_id, ts DESC) index. Used to render SSR baseline and the SSE snapshot.
 */
export async function latestSnapshots(db: Db): Promise<PriceSnapshotRow[]> {
  return db
    .selectDistinctOn([priceSnapshots.marketId])
    .from(priceSnapshots)
    .orderBy(priceSnapshots.marketId, desc(priceSnapshots.ts));
}
