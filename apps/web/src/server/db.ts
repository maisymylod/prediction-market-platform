import { createDb, type DbHandle } from '@pmp/db';
import { env } from './config.js';

// Memoize across Next dev hot-reloads so we don't leak connection pools.
const g = globalThis as unknown as { __pmpDb?: DbHandle };
const handle = g.__pmpDb ?? (g.__pmpDb = createDb(env.DATABASE_URL));

export const db = handle.db;
