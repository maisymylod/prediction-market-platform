# Cross-venue Prediction-Market Risk Console (v1)

A unified, real-time risk and analytics layer for event contracts held across
**Kalshi** and **Polymarket**. It ingests positions and live market data,
continuously recomputes one risk picture across venues, and surfaces where the
same real-world event is priced differently. The dashboard updates in near real
time with no manual refresh.

This is a **read-only, analytical** tool. It does **not** place, cancel, or
manage orders. It is picks-and-shovels infrastructure, not a trading system.

> For analytics only. Not financial advice. No guaranteed returns. Event
> contracts are regulated financial products and can resolve to zero. Any
> suggested sizing is a reference number, not a recommendation.

---

## Quickstart (no real keys required)

```bash
git clone <repo> && cd prediction-market-platform
docker compose up --build
# open http://localhost:3000
```

That brings up Postgres, runs migrations + seed, starts the worker (with the
**price simulator on by default**), and serves the dashboard. Within a few
seconds you will see marks moving, P&L and risk recomputing live, and the
cross-venue basis view flagging divergence, all on simulated data with zero
secrets.

Postgres is published on host port **5433** (to avoid clashing with a local
Postgres on 5432).

## Local development (without Docker)

```bash
cp .env.example .env                 # safe defaults; no secrets needed
docker compose up -d db              # just Postgres
pnpm install
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev:worker                      # simulator -> NOTIFY
pnpm dev:web                         # http://localhost:3000
pnpm test                            # risk engine, matcher, reconnect/stale
```

Requires Node 20+ and pnpm 9.

---

## Architecture

```
 Kalshi WS/REST ─┐
 Polymarket poll ─┤→  worker  ──insert price_snapshots──▶  Postgres
 Price simulator ─┘     │                                    │ LISTEN/NOTIFY
                        └────────── NOTIFY price_update ──────┤
                                                              ▼
   browser ◀── SSE (snapshot + deltas) ── Next.js /api/stream (1 LISTEN, N clients)
      │
      └─ applies idempotent ticks, debounced recompute via the SAME pure
         risk engine the server uses, flashes changed cells
```

- **`packages/core`** — pure, dependency-light: the **risk engine** (P&L,
  exposure, worst-case, concentration, cross-venue basis, half-Kelly), shared
  types, Zod schemas (env + wire), logger, backoff, freshness rules. No I/O, no
  clock reads inside the risk math.
- **`packages/db`** — Drizzle schema, migrations, client, and the LISTEN/NOTIFY
  transport (the swappable seam for Redis pub/sub later).
- **`packages/venues`** — real venue integrations: Kalshi RSA signer + REST + a
  resilient WebSocket, Polymarket public price client, and the Anthropic
  event matcher. All outbound calls go through one rate-limited client.
- **`apps/worker`** — long-running ingestion: WebSocket streams + REST polling +
  simulator, periodic reconciliation, feed-health tracking, audit logging.
- **`apps/web`** — Next.js (app router): SSR baseline, SSE fan-out route,
  `/api/health`, the live dashboard, and the matcher confirm UI.

### Real-time event flow

1. The worker produces a tick (Kalshi WS / Polymarket poll / simulator, all
   identical downstream), appends a `price_snapshots` row, and issues
   `NOTIFY price_update` with a small JSON payload `{marketId, mark, ts, ...}`.
2. The Next.js SSE route holds **one** `LISTEN` connection per process and fans
   each validated event out to every connected browser.
3. On every (re)connect the server sends a fresh **snapshot first**, then
   streams deltas, so a reconnecting client never resumes from stale state.
4. The browser applies updates idempotently (keyed by `marketId, ts`; older
   timestamps ignored), debounces recompute to <= once / 250 ms, and animates
   only changed cells.
5. The worker runs a periodic full **reconciliation** (default 30 s) as the
   correctness backstop for any missed streaming updates.

### Freshness and resilience

- Every WebSocket has heartbeat ping/pong, silence detection, and reconnect with
  exponential backoff + full jitter (capped), resubscribing on reconnect.
- Per-feed last-update time is tracked; the UI **derives staleness from
  timestamps**, so even if the worker dies, marks are shown STALE, never live.
- Updates are idempotent and order-insensitive.

---

## Configuration

All config is read from env and validated by Zod at startup. **The app boots and
runs with zero secrets.** See [`.env.example`](./.env.example) for every
variable. Highlights:

| Flag | Default | Effect |
| --- | --- | --- |
| `USE_PRICE_SIMULATOR` | `true` | Random-walk ticks through the real NOTIFY path |
| `USE_KALSHI_LIVE` | `false` | Connect Kalshi WS/REST (needs API key id + RSA key) |
| `USE_POLYMARKET_LIVE` | `false` | Poll Polymarket public CLOB prices |
| `POLL_INTERVAL_MS` / `RECONCILE_INTERVAL_MS` / `STALE_THRESHOLD_MS` / `DEBOUNCE_MS` / `BASIS_THRESHOLD` | see file | tunables |

Secrets (Kalshi key id + RSA private key, Anthropic key) come from env only,
are never committed, never logged (the logger redacts), and never sent to the
browser. Kalshi defaults to its **demo** environment. When a live flag is set
without its credentials, the worker logs a warning and falls back to the
simulator.

The LLM event matcher (`claude-sonnet-4-6`) is disabled when `ANTHROPIC_API_KEY`
is absent; the seed ships pre-confirmed links so the cross-venue view still
demos. Proposed matches are persisted as **unconfirmed** and are **never** used
in risk calculations until a human clicks Confirm.

---

## Testing

```bash
pnpm test
```

Covers the risk engine (hand-computed expected values, plus edge cases: zero
quantity, one-sided/missing marks, stale inputs, unconfirmed links excluded),
the event matcher (prompt + validation/normalization), the Kalshi RSA signer
(verified against a generated public key), price mappings, and the
reconnect/stale + idempotency rules.

## Out of scope for v1 (clean seams left)

Live order execution / OMS, on-chain transactions, mobile, multi-user auth and
billing, Cboe/Arena connectors, automated strategies, payments.
