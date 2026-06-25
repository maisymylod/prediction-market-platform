import {
  NOTIFY_CHANNELS,
  WIRE_VERSION,
  createLogger,
  feedStatusNotifySchema,
  priceNotifySchema,
  snapshotEventSchema,
  type FeedStatusNotify,
  type PriceNotify,
  type SnapshotEvent,
  type VenueName,
} from '@pmp/core';
import {
  subscribe,
  type Subscription,
  venues as venuesTable,
  markets as marketsTable,
  feedStatus as feedStatusTable,
  latestSnapshots,
} from '@pmp/db';
import { db } from './db.js';
import { env } from './config.js';

const log = createLogger(env.LOG_LEVEL, { mod: 'broadcaster' });

export type StreamEvent =
  | { event: 'price'; data: PriceNotify }
  | { event: 'feed_status'; data: FeedStatusNotify };

type Listener = (ev: StreamEvent) => void;

/**
 * Process-wide fan-out. Holds ONE LISTEN connection per NOTIFY channel and
 * pushes validated events to every subscribed SSE client. N browsers share one
 * DB listener. This is the swappable seam — replace `subscribe` with Redis
 * pub/sub later and nothing else changes.
 */
class Broadcaster {
  private listeners = new Set<Listener>();
  private subs: Subscription[] = [];
  private starting: Promise<void> | null = null;

  async ensureStarted(): Promise<void> {
    if (this.subs.length > 0) return;
    if (this.starting) return this.starting;
    this.starting = this.start();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async start(): Promise<void> {
    const priceSub = await subscribe(
      env.DATABASE_URL,
      NOTIFY_CHANNELS.price,
      (raw) => this.dispatch('price', raw, priceNotifySchema),
      () => log.info('listening', { channel: NOTIFY_CHANNELS.price }),
    );
    const feedSub = await subscribe(
      env.DATABASE_URL,
      NOTIFY_CHANNELS.feedStatus,
      (raw) => this.dispatch('feed_status', raw, feedStatusNotifySchema),
      () => log.info('listening', { channel: NOTIFY_CHANNELS.feedStatus }),
    );
    this.subs = [priceSub, feedSub];
  }

  private dispatch(
    event: StreamEvent['event'],
    raw: string,
    schema: typeof priceNotifySchema | typeof feedStatusNotifySchema,
  ): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      log.warn('notify payload not JSON', { event });
      return;
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      log.warn('notify payload failed validation', { event });
      return;
    }
    const ev = { event, data: result.data } as StreamEvent;
    for (const l of this.listeners) {
      try {
        l(ev);
      } catch (err) {
        log.error('listener threw', { error: (err as Error).message });
      }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Current full state for a freshly-connected client (the SSE 'snapshot'). */
  async snapshot(): Promise<SnapshotEvent> {
    const [venueRows, marketRows, snapRows, feedRows] = await Promise.all([
      db.select().from(venuesTable),
      db.select().from(marketsTable),
      latestSnapshots(db),
      db.select().from(feedStatusTable),
    ]);
    const venueName = new Map<number, VenueName>(venueRows.map((v) => [v.id, v.name]));
    const marketById = new Map(marketRows.map((m) => [m.id, m]));

    const marks: PriceNotify[] = snapRows
      .filter((s) => marketById.has(s.marketId))
      .map((s) => {
        const market = marketById.get(s.marketId)!;
        return {
          v: WIRE_VERSION,
          marketId: String(s.marketId),
          venue: venueName.get(market.venueId) ?? 'kalshi',
          mark: s.mark === null ? null : Number(s.mark),
          yesBid: s.yesBid === null ? null : Number(s.yesBid),
          yesAsk: s.yesAsk === null ? null : Number(s.yesAsk),
          ts: s.ts.toISOString(),
          source: s.source,
        };
      });

    const feeds: FeedStatusNotify[] = feedRows.map((f) => ({
      v: WIRE_VERSION,
      venue: f.venue,
      channel: f.channel,
      state: f.state,
      lastMessageAt: f.lastMessageAt ? f.lastMessageAt.toISOString() : null,
      ageMs: f.lastMessageAt ? Date.now() - f.lastMessageAt.getTime() : null,
    }));

    return snapshotEventSchema.parse({
      v: WIRE_VERSION,
      serverTs: new Date().toISOString(),
      marks,
      feeds,
    });
  }

  get clientCount(): number {
    return this.listeners.size;
  }
}

const g = globalThis as unknown as { __pmpBroadcaster?: Broadcaster };
export const broadcaster = g.__pmpBroadcaster ?? (g.__pmpBroadcaster = new Broadcaster());
