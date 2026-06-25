'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  SSE_EVENTS,
  feedStatusNotifySchema,
  priceNotifySchema,
  snapshotEventSchema,
  shouldApplyUpdate,
} from '@pmp/core';
import type { DashboardModel, FeedLite, LiveBootstrap, MarkLite } from '../server/types.js';
import { assembleDashboard } from '../lib/assemble.js';
import { Dashboard } from './Dashboard.js';
import type { ConnectionState } from './StatusBar.js';

const feedKey = (venue: string, channel: string) => `${venue}:${channel}`;

export function LiveDashboard({
  bootstrap,
  initialModel,
  debounceMs,
}: {
  bootstrap: LiveBootstrap;
  initialModel: DashboardModel;
  debounceMs: number;
}) {
  // Mutable live state held in refs; React state holds only the rendered model.
  const marksRef = useRef<Map<string, MarkLite>>(new Map(bootstrap.marks.map((m) => [m.marketId, m])));
  const feedsRef = useRef<Map<string, FeedLite>>(
    new Map(bootstrap.feeds.map((f) => [feedKey(f.venue, f.channel), f])),
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [view, setView] = useState<{ model: DashboardModel; now: number }>({
    model: initialModel,
    now: Date.parse(initialModel.generatedAt),
  });
  const [connection, setConnection] = useState<ConnectionState>('connecting');

  const recompute = useCallback(() => {
    const now = Date.now();
    const model = assembleDashboard({
      now,
      markets: bootstrap.markets,
      positionInputs: bootstrap.positionInputs,
      links: bootstrap.links,
      marks: [...marksRef.current.values()],
      feeds: [...feedsRef.current.values()],
      basisThreshold: bootstrap.basisThreshold,
      staleThresholdMs: bootstrap.staleThresholdMs,
    });
    setView({ model, now });
  }, [bootstrap]);

  // Debounce recomputes to at most once per debounceMs to avoid burst thrash.
  const scheduleRecompute = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      recompute();
    }, debounceMs);
  }, [recompute, debounceMs]);

  useEffect(() => {
    const es = new EventSource('/api/stream');

    es.addEventListener('open', () => setConnection('connecting'));

    es.addEventListener(SSE_EVENTS.snapshot, (e) => {
      const parsed = snapshotEventSchema.safeParse(JSON.parse((e as MessageEvent).data));
      if (!parsed.success) return;
      // A snapshot is authoritative — rebuild the baseline from it.
      const next = new Map<string, MarkLite>();
      for (const m of parsed.data.marks) {
        next.set(m.marketId, {
          marketId: m.marketId,
          venue: m.venue,
          yesBid: m.yesBid,
          yesAsk: m.yesAsk,
          mark: m.mark,
          ts: Date.parse(m.ts),
        });
      }
      marksRef.current = next;
      const feeds = new Map<string, FeedLite>();
      for (const f of parsed.data.feeds) {
        feeds.set(feedKey(f.venue, f.channel), {
          venue: f.venue,
          channel: f.channel,
          state: f.state,
          lastMessageAt: f.lastMessageAt ? Date.parse(f.lastMessageAt) : null,
        });
      }
      feedsRef.current = feeds;
      setConnection('live');
      recompute();
    });

    es.addEventListener(SSE_EVENTS.price, (e) => {
      const parsed = priceNotifySchema.safeParse(JSON.parse((e as MessageEvent).data));
      if (!parsed.success) return;
      const p = parsed.data;
      const ts = Date.parse(p.ts);
      const existing = marksRef.current.get(p.marketId);
      // Idempotent + ordered: ignore stale/duplicate ticks (keyed by marketId, ts).
      if (!shouldApplyUpdate(ts, existing?.ts)) return;
      marksRef.current.set(p.marketId, {
        marketId: p.marketId,
        venue: p.venue,
        yesBid: p.yesBid,
        yesAsk: p.yesAsk,
        mark: p.mark,
        ts,
      });
      scheduleRecompute();
    });

    es.addEventListener(SSE_EVENTS.feedStatus, (e) => {
      const parsed = feedStatusNotifySchema.safeParse(JSON.parse((e as MessageEvent).data));
      if (!parsed.success) return;
      const f = parsed.data;
      feedsRef.current.set(feedKey(f.venue, f.channel), {
        venue: f.venue,
        channel: f.channel,
        state: f.state,
        lastMessageAt: f.lastMessageAt ? Date.parse(f.lastMessageAt) : null,
      });
      scheduleRecompute();
    });

    es.addEventListener('error', () => {
      // EventSource auto-reconnects; on reconnect the server resends a snapshot.
      setConnection((c) => (c === 'live' ? 'reconnecting' : 'connecting'));
    });

    // Wall-clock tick so freshness/staleness/age update even with no price moves.
    const clock = setInterval(() => recompute(), 1000);

    return () => {
      es.close();
      clearInterval(clock);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [recompute, scheduleRecompute]);

  return <Dashboard model={view.model} connection={connection} now={view.now} />;
}
