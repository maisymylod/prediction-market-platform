// System-wide constants shared by worker and web. NOT secrets.

/** Postgres LISTEN/NOTIFY channels. The worker NOTIFYs, the SSE route LISTENs. */
export const NOTIFY_CHANNELS = {
  /** Payload: PriceNotify — a new mark for one market. */
  price: 'price_update',
  /** Payload: FeedStatusNotify — a feed health transition. */
  feedStatus: 'feed_status',
} as const;

/** Named events sent over the SSE stream to the browser. */
export const SSE_EVENTS = {
  /** Full baseline state, sent first on every (re)connect. */
  snapshot: 'snapshot',
  /** Incremental mark update. */
  price: 'price',
  /** Feed health transition. */
  feedStatus: 'feed_status',
} as const;

/** Wire-format version stamped on every NOTIFY and SSE payload. */
export const WIRE_VERSION = 1;

/** Postgres truncates NOTIFY payloads above 8000 bytes; we stay well under. */
export const MAX_NOTIFY_BYTES = 7000;
