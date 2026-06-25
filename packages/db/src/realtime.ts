import postgres, { type Sql } from 'postgres';

// ---------------------------------------------------------------------------
// LISTEN/NOTIFY transport. This is the swappable seam: the worker NOTIFYs and
// the SSE route LISTENs through these helpers. To move to Redis pub/sub later,
// reimplement `publish` and `subscribe` with the same signatures — no UI or
// risk-engine code changes.
// ---------------------------------------------------------------------------

/** Publish a JSON payload on a channel (worker side). */
export async function publish(sql: Sql, channel: string, payload: unknown): Promise<void> {
  await sql.notify(channel, JSON.stringify(payload));
}

export interface Subscription {
  unsubscribe: () => Promise<void>;
}

/**
 * Open a DEDICATED connection that LISTENs on a channel and invokes `onMessage`
 * with each raw JSON string. postgres-js auto-reconnects the underlying socket;
 * `onListen` fires on (re)subscribe so callers can refresh a baseline snapshot.
 *
 * Use one of these per web process and fan out to in-memory SSE clients — N
 * browsers share one DB listener.
 */
export async function subscribe(
  connectionString: string,
  channel: string,
  onMessage: (raw: string) => void,
  onListen?: () => void,
): Promise<Subscription & { sql: Sql }> {
  // A separate single connection: LISTEN occupies the socket for its lifetime.
  const sql = postgres(connectionString, { max: 1 });
  await sql.listen(channel, onMessage, onListen);
  return {
    sql,
    unsubscribe: async () => void (await sql.end({ timeout: 5 })),
  };
}
