import { createDb, type DbHandle } from '@pmp/db';
import { env } from './config.js';

export const handle: DbHandle = createDb(env.DATABASE_URL, { max: 5 });
export const db = handle.db;
export const sql = handle.sql;
