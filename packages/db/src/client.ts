import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  /** Raw postgres-js client — used for NOTIFY and for a dedicated LISTEN socket. */
  sql: Sql;
  close: () => Promise<void>;
}

/**
 * Create a Drizzle client over a pooled postgres-js connection.
 * Callers own the lifecycle; web/worker memoize their own singletons.
 */
export function createDb(connectionString: string, opts: { max?: number } = {}): DbHandle {
  const sql = postgres(connectionString, {
    max: opts.max ?? 10,
    // Keep NOTIFY payloads as strings; we JSON-parse explicitly.
    transform: { undefined: null },
  });
  const db = drizzle(sql, { schema });
  return { db, sql, close: async () => void (await sql.end({ timeout: 5 })) };
}

export { schema };
