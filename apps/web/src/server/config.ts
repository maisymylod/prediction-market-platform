import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { parseEnv } from '@pmp/core';

// Load the repo-root .env when running locally (apps/web cwd). In docker the
// vars are injected via env_file and dotenv won't override them.
loadEnv({ path: resolve(process.cwd(), '../../.env') });

export const env = parseEnv();
