import { sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { priceSnapshots } from './schema.js';
import type { PriceSnapshotRow } from './schema.js';

/**
 * Latest snapshot per market via DISTINCT ON — cheap with the
 * (market_id, ts DESC) index. Used to render SSR baseline and the SSE snapshot.
 */
export async function latestSnapshots(db: Db): Promise<PriceSnapshotRow[]> {
  const rows = await db.execute<PriceSnapshotRow>(sql`
    SELECT DISTINCT ON (${priceSnapshots.marketId})
      ${priceSnapshots.id} AS id,
      ${priceSnapshots.marketId} AS market_id,
      ${priceSnapshots.yesBid} AS yes_bid,
      ${priceSnapshots.yesAsk} AS yes_ask,
      ${priceSnapshots.mark} AS mark,
      ${priceSnapshots.ts} AS ts,
      ${priceSnapshots.source} AS source
    FROM ${priceSnapshots}
    ORDER BY ${priceSnapshots.marketId}, ${priceSnapshots.ts} DESC
  `);
  // drizzle-orm/postgres-js returns an array of row objects.
  return rows as unknown as PriceSnapshotRow[];
}
