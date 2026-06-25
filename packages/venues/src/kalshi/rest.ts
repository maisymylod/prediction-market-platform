import { z } from 'zod';
import type { RateLimitedClient } from '../http/index.js';
import type { KalshiSigner } from './signer.js';
import {
  kalshiMarketsResponseSchema,
  kalshiPositionsResponseSchema,
} from './schemas.js';

// Read-only Kalshi REST client. Public market-data endpoints need no auth;
// portfolio endpoints are signed. ALL calls go through the rate-limited client.
export class KalshiRestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly http: RateLimitedClient,
    private readonly signer: KalshiSigner | null = null,
  ) {}

  private authHeaders(method: string, url: string): Record<string, string> {
    if (!this.signer) return {};
    const path = new URL(url).pathname;
    return this.signer.sign(method, path) as unknown as Record<string, string>;
  }

  /** Public: list markets (optionally filtered by tickers/status). */
  async getMarkets(params: Record<string, string> = {}) {
    const url = `${this.baseUrl}/markets?${new URLSearchParams(params).toString()}`;
    return this.http.getJson(url, (d) => kalshiMarketsResponseSchema.parse(d));
  }

  /** Signed: current portfolio positions. Returns empty when unauthenticated. */
  async getPositions() {
    if (!this.signer) return { market_positions: [] as z.infer<typeof kalshiPositionsResponseSchema>['market_positions'] };
    const url = `${this.baseUrl}/portfolio/positions`;
    return this.http.getJson(
      url,
      (d) => kalshiPositionsResponseSchema.parse(d),
      { headers: this.authHeaders('GET', url) },
    );
  }
}
