// Worker entrypoint. Real-time ingestion spine is wired up in build step 4
// (simulator + NOTIFY) and steps 5-6 (Kalshi + Polymarket). Placeholder boots
// and validates env so the workspace installs and typechecks from step 1.
import 'dotenv/config';
import { parseEnv, createLogger } from '@pmp/core';

const env = parseEnv();
const log = createLogger(env.LOG_LEVEL, { proc: 'worker' });
log.info('worker booted (ingestion spine added in step 4)', {
  simulator: env.USE_PRICE_SIMULATOR,
  kalshiLive: env.USE_KALSHI_LIVE,
  polymarketLive: env.USE_POLYMARKET_LIVE,
});
