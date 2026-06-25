import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load the repo-root .env regardless of the package cwd pnpm runs us from.
loadEnv({ path: resolve(__dirname, '../../../.env') });

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgres://pmp:pmp@localhost:5432/pmp';
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);
  const migrationsFolder = resolve(__dirname, '../migrations');
  console.log(`[migrate] applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  await sql.end();
  console.log('[migrate] done');
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
