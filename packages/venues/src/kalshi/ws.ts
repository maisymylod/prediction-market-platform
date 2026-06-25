import WebSocket from 'ws';
import { backoffDelay, type Logger } from '@pmp/core';
import type { KalshiSigner } from './signer.js';
import { mapWsTicker, type NormalizedTick } from './map.js';
import { wsEnvelopeSchema, wsTickerSchema } from './schemas.js';

export type WsConnState = 'live' | 'reconnecting' | 'down';

export interface KalshiWsOptions {
  url: string;
  signer: KalshiSigner;
  marketTickers: string[];
  channels?: string[];
  onTick: (tick: NormalizedTick & { tsMs: number }) => void;
  onState: (state: WsConnState) => void;
  logger?: Logger;
  /** Silence (ms) before we treat the socket as dead and reconnect. */
  silenceMs?: number;
  pingMs?: number;
  rng?: () => number;
}

/**
 * Persistent Kalshi market-data WebSocket. Heartbeat ping/pong, silence
 * detection, reconnect with exponential backoff + full jitter (capped), and
 * resubscribe on every (re)connect.
 */
export class KalshiWsClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private cmdId = 0;
  private lastMessageAt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly silenceMs: number;
  private readonly pingMs: number;

  constructor(private readonly opts: KalshiWsOptions) {
    this.silenceMs = opts.silenceMs ?? 15_000;
    this.pingMs = opts.pingMs ?? 10_000;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.ws?.removeAllListeners();
    this.ws?.close();
    this.ws = null;
    this.opts.onState('down');
  }

  private connect(): void {
    if (this.stopped) return;
    const path = new URL(this.opts.url).pathname;
    const headers = this.opts.signer.sign('GET', path) as unknown as Record<string, string>;
    const ws = new WebSocket(this.opts.url, { headers });
    this.ws = ws;

    ws.on('open', () => {
      this.attempt = 0;
      this.lastMessageAt = Date.now();
      this.opts.logger?.info('kalshi ws open', { tickers: this.opts.marketTickers.length });
      this.subscribe();
      this.startHeartbeat();
      this.opts.onState('live');
    });

    ws.on('message', (data) => this.onMessage(data));
    ws.on('pong', () => {
      this.lastMessageAt = Date.now();
    });
    ws.on('close', (code) => {
      this.opts.logger?.warn('kalshi ws closed', { code });
      this.scheduleReconnect();
    });
    ws.on('error', (err) => {
      this.opts.logger?.warn('kalshi ws error', { error: (err as Error).message });
      // 'close' will follow and drive the reconnect.
    });
  }

  private subscribe(): void {
    const msg = {
      id: ++this.cmdId,
      cmd: 'subscribe',
      params: {
        channels: this.opts.channels ?? ['ticker'],
        market_tickers: this.opts.marketTickers,
      },
    };
    this.ws?.send(JSON.stringify(msg));
  }

  private onMessage(data: WebSocket.RawData): void {
    this.lastMessageAt = Date.now();
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return;
    }
    const env = wsEnvelopeSchema.safeParse(parsed);
    if (!env.success) return;
    if (env.data.type === 'ticker') {
      const t = wsTickerSchema.safeParse(parsed);
      if (t.success) this.opts.onTick({ ...mapWsTicker(t.data), tsMs: Date.now() });
    }
  }

  private startHeartbeat(): void {
    this.clearTimers();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch {
          /* ignore; watchdog will catch silence */
        }
      }
    }, this.pingMs);
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastMessageAt > this.silenceMs) {
        this.opts.logger?.warn('kalshi ws silent, terminating', { silenceMs: this.silenceMs });
        this.ws?.terminate();
      }
    }, Math.max(1000, Math.floor(this.silenceMs / 3)));
  }

  private scheduleReconnect(): void {
    this.clearTimers();
    this.ws?.removeAllListeners();
    this.ws = null;
    if (this.stopped) return;
    this.opts.onState('reconnecting');
    const delay = backoffDelay(this.attempt++, {
      baseMs: 500,
      maxMs: 30_000,
      rng: this.opts.rng,
    });
    this.opts.logger?.info('kalshi ws reconnect scheduled', { attempt: this.attempt, delay });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pingTimer = this.watchdog = this.reconnectTimer = null;
  }
}
