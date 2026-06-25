import {
  pgEnum,
  pgTable,
  serial,
  bigserial,
  integer,
  text,
  boolean,
  numeric,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const venueName = pgEnum('venue_name', ['kalshi', 'polymarket']);
export const marketStatus = pgEnum('market_status', ['active', 'closed', 'settled']);
export const side = pgEnum('side', ['yes', 'no']);
export const priceSource = pgEnum('price_source', ['live', 'sim', 'reconcile']);
export const feedState = pgEnum('feed_state', ['live', 'stale', 'reconnecting', 'down']);
export const legAlignment = pgEnum('leg_alignment', ['direct', 'inverse']);
export const linkSource = pgEnum('link_source', ['llm', 'manual']);
export const positionSource = pgEnum('position_source', ['manual', 'api']);
export const ingestKind = pgEnum('ingest_kind', ['ws', 'poll', 'reconcile', 'sim']);
export const ingestStatus = pgEnum('ingest_status', ['running', 'ok', 'error']);

// Money/probability as numeric to avoid float drift. Probabilities live in
// [0,1] with 4 decimal places; quantities allow fractional contracts.
const probability = (name: string) => numeric(name, { precision: 6, scale: 4 });
const quantity = (name: string) => numeric(name, { precision: 20, scale: 4 });

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
export const venues = pgTable('venues', {
  id: serial('id').primaryKey(),
  name: venueName('name').notNull().unique(),
  baseUrl: text('base_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const markets = pgTable(
  'markets',
  {
    id: serial('id').primaryKey(),
    venueId: integer('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    externalTicker: text('external_ticker').notNull(),
    question: text('question').notNull(),
    category: text('category'),
    resolutionDate: timestamp('resolution_date', { withTimezone: true }),
    resolutionCriteria: text('resolution_criteria'),
    status: marketStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    venueTickerUq: uniqueIndex('markets_venue_ticker_uq').on(t.venueId, t.externalTicker),
  }),
);

export const eventLinks = pgTable('event_links', {
  id: serial('id').primaryKey(),
  canonicalQuestion: text('canonical_question').notNull(),
  category: text('category'),
  confidence: numeric('confidence', { precision: 5, scale: 4 }),
  rationale: text('rationale'),
  source: linkSource('source').notNull().default('manual'),
  confirmed: boolean('confirmed').notNull().default(false),
  // True when the legs' resolution criteria are known to differ — a real trap.
  resolutionMismatch: boolean('resolution_mismatch').notNull().default(false),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const eventLinkMarkets = pgTable(
  'event_link_markets',
  {
    eventLinkId: integer('event_link_id')
      .notNull()
      .references(() => eventLinks.id, { onDelete: 'cascade' }),
    marketId: integer('market_id')
      .notNull()
      .references(() => markets.id, { onDelete: 'cascade' }),
    alignment: legAlignment('alignment').notNull().default('direct'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.eventLinkId, t.marketId] }),
  }),
);

export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  venueId: integer('venue_id')
    .notNull()
    .references(() => venues.id, { onDelete: 'cascade' }),
  marketId: integer('market_id')
    .notNull()
    .references(() => markets.id, { onDelete: 'cascade' }),
  side: side('side').notNull(),
  quantity: quantity('quantity').notNull(),
  avgPrice: probability('avg_price').notNull(),
  walletAddress: text('wallet_address'),
  source: positionSource('source').notNull().default('manual'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fills = pgTable('fills', {
  id: serial('id').primaryKey(),
  positionId: integer('position_id').references(() => positions.id, { onDelete: 'set null' }),
  venueId: integer('venue_id')
    .notNull()
    .references(() => venues.id, { onDelete: 'cascade' }),
  marketId: integer('market_id')
    .notNull()
    .references(() => markets.id, { onDelete: 'cascade' }),
  side: side('side').notNull(),
  quantity: quantity('quantity').notNull(),
  price: probability('price').notNull(),
  fee: numeric('fee', { precision: 12, scale: 6 }).notNull().default('0'),
  externalId: text('external_id'),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
});

export const priceSnapshots = pgTable(
  'price_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    marketId: integer('market_id')
      .notNull()
      .references(() => markets.id, { onDelete: 'cascade' }),
    yesBid: probability('yes_bid'),
    yesAsk: probability('yes_ask'),
    mark: probability('mark'),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    source: priceSource('source').notNull(),
  },
  (t) => ({
    // Hot path: "latest snapshot per market" and time-range scans.
    marketTsIdx: index('price_snapshots_market_ts_idx').on(t.marketId, t.ts.desc()),
  }),
);

export const feedStatus = pgTable(
  'feed_status',
  {
    id: serial('id').primaryKey(),
    venue: venueName('venue').notNull(),
    channel: text('channel').notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    state: feedState('state').notNull().default('down'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    venueChannelUq: uniqueIndex('feed_status_venue_channel_uq').on(t.venue, t.channel),
  }),
);

export const ingestionRuns = pgTable('ingestion_runs', {
  id: serial('id').primaryKey(),
  venue: venueName('venue'),
  kind: ingestKind('kind').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  rowsWritten: integer('rows_written').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  errorDetail: jsonb('error_detail'),
  status: ingestStatus('status').notNull().default('running'),
});

// Convenience row types (numeric columns arrive as strings — convert at the
// boundary before handing to the pure risk engine).
export type VenueRow = typeof venues.$inferSelect;
export type MarketRow = typeof markets.$inferSelect;
export type EventLinkRow = typeof eventLinks.$inferSelect;
export type PositionRow = typeof positions.$inferSelect;
export type PriceSnapshotRow = typeof priceSnapshots.$inferSelect;
export type FeedStatusRow = typeof feedStatus.$inferSelect;
export type IngestionRunRow = typeof ingestionRuns.$inferSelect;
