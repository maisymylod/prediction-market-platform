import type { RateLimitedClient } from '../http/index.js';
import { clobPriceSchema } from './schemas.js';
import { parsePrice, quoteFrom } from './map.js';

// Read-only Polymarket public price client. No auth, no on-chain signing (v1).
// All calls go through the rate-limited client.
export class PolymarketClient {
  constructor(
    private readonly clobBase: string,
    private readonly http: RateLimitedClient,
  ) {}

  /** Best price for one side of a CLOB token: 'buy' = ask, 'sell' = bid. */
  async getPrice(tokenId: string, side: 'buy' | 'sell'): Promise<number | null> {
    const url = `${this.clobBase}/price?token_id=${encodeURIComponent(tokenId)}&side=${side}`;
    try {
      const data = await this.http.getJson(url, (d) => clobPriceSchema.parse(d));
      return parsePrice(data.price);
    } catch {
      return null;
    }
  }

  /** Full YES quote (bid/ask/mark) for a token. */
  async getQuote(tokenId: string) {
    const [ask, bid] = await Promise.all([
      this.getPrice(tokenId, 'buy'),
      this.getPrice(tokenId, 'sell'),
    ]);
    return quoteFrom(ask, bid);
  }
}
