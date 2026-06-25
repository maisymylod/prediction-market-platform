// Minimal dependency-free structured logger. JSON lines, leveled, with a
// redaction pass so secrets never reach the output. NOT imported by the pure
// risk module (which stays I/O-free); used by worker + web server code.

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

// Keys whose values are always redacted, case-insensitive substring match.
const SECRET_KEY_PATTERNS = [
  'key',
  'secret',
  'token',
  'password',
  'private',
  'authorization',
  'wallet',
  'signature',
  'apikey',
];

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_KEY_PATTERNS.some((p) => k.includes(p));
}

/** Recursively redact secret-looking fields. Defensive: never log a secret. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSecretKey(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  error: (msg: string, ctx?: Record<string, unknown>) => void;
  warn: (msg: string, ctx?: Record<string, unknown>) => void;
  info: (msg: string, ctx?: Record<string, unknown>) => void;
  debug: (msg: string, ctx?: Record<string, unknown>) => void;
  child: (bindings: Record<string, unknown>) => Logger;
}

export function createLogger(
  level: LogLevel = 'info',
  bindings: Record<string, unknown> = {},
  // Injectable clock so callers control timestamps; defaults to wall clock.
  now: () => Date = () => new Date(),
): Logger {
  const threshold = LEVELS[level];
  const emit = (lvl: LogLevel, msg: string, ctx?: Record<string, unknown>) => {
    if (LEVELS[lvl] > threshold) return;
    const line = {
      level: lvl,
      time: now().toISOString(),
      msg,
      ...(redact(bindings) as Record<string, unknown>),
      ...((ctx ? (redact(ctx) as Record<string, unknown>) : {})),
    };
    const out = lvl === 'error' || lvl === 'warn' ? process.stderr : process.stdout;
    out.write(JSON.stringify(line) + '\n');
  };
  return {
    error: (m, c) => emit('error', m, c),
    warn: (m, c) => emit('warn', m, c),
    info: (m, c) => emit('info', m, c),
    debug: (m, c) => emit('debug', m, c),
    child: (b) => createLogger(level, { ...bindings, ...b }, now),
  };
}
