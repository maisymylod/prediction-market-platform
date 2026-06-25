import { z } from 'zod';

// Zod schemas for Kalshi payloads (constraint: validate every external shape).
// Prices are integer CENTS (0-100). Schemas are lenient on unknown fields but
// strict on the fields we consume.

export const kalshiMarketSchema = z
  .object({
    ticker: z.string(),
    title: z.string().optional(),
    status: z.string().optional(),
    yes_bid: z.number().nullable().optional(),
    yes_ask: z.number().nullable().optional(),
    last_price: z.number().nullable().optional(),
    close_time: z.string().optional(),
  })
  .passthrough();
export type KalshiMarket = z.infer<typeof kalshiMarketSchema>;

export const kalshiMarketsResponseSchema = z.object({
  markets: z.array(kalshiMarketSchema),
  cursor: z.string().optional(),
});

export const kalshiMarketResponseSchema = z.object({ market: kalshiMarketSchema });

export const kalshiPositionSchema = z
  .object({
    ticker: z.string(),
    position: z.number(), // signed contract count (+yes / -no)
    market_exposure: z.number().optional(),
  })
  .passthrough();

export const kalshiPositionsResponseSchema = z.object({
  market_positions: z.array(kalshiPositionSchema).default([]),
});

// --- WebSocket messages ---
export const wsTickerSchema = z.object({
  type: z.literal('ticker'),
  sid: z.number().optional(),
  msg: z
    .object({
      market_ticker: z.string(),
      yes_bid: z.number().nullable().optional(),
      yes_ask: z.number().nullable().optional(),
      price: z.number().nullable().optional(),
      ts: z.number().optional(),
    })
    .passthrough(),
});
export type WsTicker = z.infer<typeof wsTickerSchema>;

export const wsTradeSchema = z.object({
  type: z.literal('trade'),
  msg: z
    .object({
      market_ticker: z.string(),
      yes_price: z.number().nullable().optional(),
      count: z.number().optional(),
      ts: z.number().optional(),
    })
    .passthrough(),
});

// Generic envelope for messages we don't specifically handle (error, subscribed…).
export const wsEnvelopeSchema = z.object({ type: z.string() }).passthrough();
