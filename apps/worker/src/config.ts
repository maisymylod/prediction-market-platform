import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { parseEnv, createLogger } from '@pmp/core';

// Load repo-root .env when run locally (cwd apps/worker); docker injects vars.
loadEnv({ path: resolve(process.cwd(), '../../.env') });

export const env = parseEnv();
export const log = createLogger(env.LOG_LEVEL, { proc: 'worker' });
