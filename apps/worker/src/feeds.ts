import {
  NOTIFY_CHANNELS,
  WIRE_VERSION,
  freshnessFor,
  type FeedState,
  type FeedStatusNotify,
  type VenueName,
} from '@pmp/core';
import { feedStatus, publish } from '@pmp/db';
import { db, sql } from './db.js';
import { log } from './config.js';

interface FeedEntry {
  venue: VenueName;
  channel: string;
  lastMessageAt: number | null;
  state: FeedState;
  lastPublishedAt: number;
}

/** Default venue -> primary feed channel name. */
export const VENUE_CHANNEL: Record<VenueName, string> = {
  kalshi: 'ticker',
  polymarket: 'poll',
};

/**
 * Tracks per-feed last-message time and republishes/NOTIFYs feed health on a
 * cadence: immediately on a state transition, and periodically so age advances
 * and a quiet feed flips to STALE without manual refresh.
 */
export class FeedMonitor {
  private feeds = new Map<string, FeedEntry>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly staleThresholdMs: number,
    private readonly evalIntervalMs = 2000,
    private readonly republishMs = 3000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private key(venue: VenueName, channel: string) {
    return `${venue}:${channel}`;
  }

  track(venue: VenueName, channel: string): void {
    const k = this.key(venue, channel);
    if (!this.feeds.has(k)) {
      this.feeds.set(k, { venue, channel, lastMessageAt: null, state: 'down', lastPublishedAt: 0 });
    }
  }

  /** Record a live message on a feed. */
  touch(venue: VenueName, channel: string, ts: number = this.now()): void {
    const k = this.key(venue, channel);
    const entry = this.feeds.get(k) ?? {
      venue,
      channel,
      lastMessageAt: null,
      state: 'down' as FeedState,
      lastPublishedAt: 0,
    };
    entry.lastMessageAt = Math.max(entry.lastMessageAt ?? 0, ts);
    this.feeds.set(k, entry);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.evaluate(), this.evalIntervalMs);
    log.info('feed monitor started', { staleThresholdMs: this.staleThresholdMs });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Mark every tracked feed down (used on shutdown). */
  async markAllDown(): Promise<void> {
    const now = this.now();
    for (const entry of this.feeds.values()) {
      entry.state = 'down';
      await this.persistAndNotify(entry, now);
    }
  }

  private async evaluate(): Promise<void> {
    const now = this.now();
    for (const entry of this.feeds.values()) {
      const next = freshnessFor(entry.lastMessageAt, now, this.staleThresholdMs) as FeedState;
      const changed = next !== entry.state;
      const due = now - entry.lastPublishedAt > this.republishMs;
      entry.state = next;
      if (changed || due) {
        await this.persistAndNotify(entry, now);
        if (changed) log.info('feed state change', { feed: this.key(entry.venue, entry.channel), state: next });
      }
    }
  }

  private async persistAndNotify(entry: FeedEntry, now: number): Promise<void> {
    entry.lastPublishedAt = now;
    const lastMessageAt = entry.lastMessageAt ? new Date(entry.lastMessageAt) : null;
    try {
      await db
        .insert(feedStatus)
        .values({ venue: entry.venue, channel: entry.channel, state: entry.state, lastMessageAt })
        .onConflictDoUpdate({
          target: [feedStatus.venue, feedStatus.channel],
          set: { state: entry.state, lastMessageAt, updatedAt: new Date() },
        });
      const payload: FeedStatusNotify = {
        v: WIRE_VERSION,
        venue: entry.venue,
        channel: entry.channel,
        state: entry.state,
        lastMessageAt: lastMessageAt ? lastMessageAt.toISOString() : null,
        ageMs: entry.lastMessageAt ? now - entry.lastMessageAt : null,
      };
      await publish(sql, NOTIFY_CHANNELS.feedStatus, payload);
    } catch (err) {
      log.error('feed persist/notify failed', { error: (err as Error).message });
    }
  }
}
