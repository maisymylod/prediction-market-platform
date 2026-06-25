import { z } from 'zod';
import { WIRE_VERSION } from '../constants.js';

// ---------------------------------------------------------------------------
// Wire contracts for the real-time spine. The worker emits NOTIFY payloads;
// the SSE route validates them on the way in and re-frames them as SSE events
// on the way out. The browser validates SSE events before applying them.
// Keeping these in one place is the seam that lets us swap LISTEN/NOTIFY for
// Redis pub/sub later without touching the UI.
// ---------------------------------------------------------------------------

const probability = z.number().min(0).max(1);
const venue = z.enum(['kalshi', 'polymarket']);
const feedState = z.enum(['live', 'stale', 'reconnecting', 'down']);

/** NOTIFY 'price_update' payload (also the per-row SSE 'price' event body). */
export const priceNotifySchema = z.object({
  v: z.literal(WIRE_VERSION),
  marketId: z.string(),
  venue,
  mark: probability.nullable(),
  yesBid: probability.nullable(),
  yesAsk: probability.nullable(),
  /** ISO-8601 timestamp; idempotency key together with marketId. */
  ts: z.string().datetime(),
  source: z.enum(['live', 'sim', 'reconcile']),
});
export type PriceNotify = z.infer<typeof priceNotifySchema>;

/** NOTIFY 'feed_status' payload (also the SSE 'feed_status' event body). */
export const feedStatusNotifySchema = z.object({
  v: z.literal(WIRE_VERSION),
  venue,
  channel: z.string(),
  state: feedState,
  lastMessageAt: z.string().datetime().nullable(),
  ageMs: z.number().int().nonnegative().nullable(),
});
export type FeedStatusNotify = z.infer<typeof feedStatusNotifySchema>;

/** Full baseline state sent first on every SSE (re)connect. */
export const snapshotEventSchema = z.object({
  v: z.literal(WIRE_VERSION),
  serverTs: z.string().datetime(),
  marks: z.array(priceNotifySchema),
  feeds: z.array(feedStatusNotifySchema),
});
export type SnapshotEvent = z.infer<typeof snapshotEventSchema>;
