import { feedStatus as feedStatusTable } from '@pmp/db';
import { db } from '../../../src/server/db.js';
import { env } from '../../../src/server/config.js';
import { broadcaster } from '../../../src/server/broadcaster.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness + per-feed last-update age. Worker is considered live if any feed
 * has reported within 3x the stale threshold. */
export async function GET(): Promise<Response> {
  const now = Date.now();
  let rows: { venue: string; channel: string; state: string; lastMessageAt: Date | null }[] = [];
  let dbOk = true;
  try {
    rows = await db.select().from(feedStatusTable);
  } catch {
    dbOk = false;
  }

  const feeds = rows.map((f) => ({
    venue: f.venue,
    channel: f.channel,
    state: f.state,
    ageMs: f.lastMessageAt ? now - f.lastMessageAt.getTime() : null,
  }));

  const liveWindow = env.STALE_THRESHOLD_MS * 3;
  const workerLive = feeds.some((f) => f.ageMs !== null && f.ageMs < liveWindow);

  const body = {
    ok: dbOk,
    workerLive,
    sseClients: broadcaster.clientCount,
    feeds,
    serverTs: new Date(now).toISOString(),
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: dbOk ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
