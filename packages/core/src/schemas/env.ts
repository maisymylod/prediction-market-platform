import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment validation. Parsed once at startup in both web and worker.
// EVERY secret field is OPTIONAL so the app boots and runs with zero secrets;
// the worker logs a warning if a live flag is set without its credentials and
// falls back to the simulator. Never log the parsed result verbatim.
// ---------------------------------------------------------------------------

/** Coerce "true"/"false"/"1"/"0" strings to boolean with a default. */
const boolFlag = (def: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .transform((v) =>
      typeof v === 'boolean' ? v : ['true', '1', 'yes', 'on'].includes(v.toLowerCase()),
    )
    .default(def);

const intWithDefault = (def: number, min = 0) =>
  z.coerce.number().int().min(min).default(def);

const floatWithDefault = (def: number, min = 0, max = 1) =>
  z.coerce.number().min(min).max(max).default(def);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  DATABASE_URL: z.string().url().default('postgres://pmp:pmp@localhost:5432/pmp'),
  WEB_PORT: intWithDefault(3000, 1),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  // Feature flags — simulator on, live venues off by default.
  USE_PRICE_SIMULATOR: boolFlag(true),
  USE_KALSHI_LIVE: boolFlag(false),
  USE_POLYMARKET_LIVE: boolFlag(false),

  // Tunables.
  POLL_INTERVAL_MS: intWithDefault(3000, 250),
  RECONCILE_INTERVAL_MS: intWithDefault(30000, 1000),
  STALE_THRESHOLD_MS: intWithDefault(10000, 1000),
  DEBOUNCE_MS: intWithDefault(250, 0),
  BASIS_THRESHOLD: floatWithDefault(0.05, 0, 1),
  SIMULATOR_TICK_MS: intWithDefault(1000, 100),

  // Kalshi (all optional; demo defaults for the non-secret URLs).
  KALSHI_API_BASE: z.string().url().default('https://demo-api.kalshi.co/trade-api/v2'),
  KALSHI_WS_URL: z.string().url().default('wss://demo-api.kalshi.co/trade-api/ws/v2'),
  KALSHI_API_KEY_ID: z.string().optional(),
  KALSHI_PRIVATE_KEY_PATH: z.string().optional(),
  KALSHI_PRIVATE_KEY: z.string().optional(),

  // Polymarket (all optional; public-data URLs have defaults).
  POLYMARKET_CLOB_BASE: z.string().url().default('https://clob.polymarket.com'),
  POLYMARKET_GAMMA_BASE: z.string().url().default('https://gamma-api.polymarket.com'),
  POLYMARKET_WALLET_ADDRESS: z.string().optional(),

  // Anthropic (optional; matcher disabled when absent).
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate process.env. Throws a single readable error listing every
 * invalid field (never echoing secret values) if validation fails.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

/** True when Kalshi auth credentials are present (needed for positions/fills). */
export function hasKalshiCreds(env: Env): boolean {
  return Boolean(env.KALSHI_API_KEY_ID && (env.KALSHI_PRIVATE_KEY_PATH || env.KALSHI_PRIVATE_KEY));
}

/** True when the LLM matcher can run. */
export function hasAnthropicCreds(env: Env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}
