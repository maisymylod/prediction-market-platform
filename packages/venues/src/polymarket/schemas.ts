import { z } from 'zod';

// Polymarket public API payloads (validated per constraint). CLOB returns prices
// as decimal strings in [0,1]; Gamma returns market metadata.

export const clobPriceSchema = z.object({
  price: z.union([z.string(), z.number()]),
});
export type ClobPrice = z.infer<typeof clobPriceSchema>;

export const gammaMarketSchema = z
  .object({
    question: z.string().optional(),
    conditionId: z.string().optional(),
    slug: z.string().optional(),
    outcomes: z.union([z.string(), z.array(z.string())]).optional(),
    outcomePrices: z.union([z.string(), z.array(z.string())]).optional(),
    clobTokenIds: z.union([z.string(), z.array(z.string())]).optional(),
    closed: z.boolean().optional(),
  })
  .passthrough();
export type GammaMarket = z.infer<typeof gammaMarketSchema>;

export const gammaMarketsSchema = z.array(gammaMarketSchema);
