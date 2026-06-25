CREATE TYPE "public"."feed_state" AS ENUM('live', 'stale', 'reconnecting', 'down');--> statement-breakpoint
CREATE TYPE "public"."ingest_kind" AS ENUM('ws', 'poll', 'reconcile', 'sim');--> statement-breakpoint
CREATE TYPE "public"."ingest_status" AS ENUM('running', 'ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."leg_alignment" AS ENUM('direct', 'inverse');--> statement-breakpoint
CREATE TYPE "public"."link_source" AS ENUM('llm', 'manual');--> statement-breakpoint
CREATE TYPE "public"."market_status" AS ENUM('active', 'closed', 'settled');--> statement-breakpoint
CREATE TYPE "public"."position_source" AS ENUM('manual', 'api');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('live', 'sim', 'reconcile');--> statement-breakpoint
CREATE TYPE "public"."side" AS ENUM('yes', 'no');--> statement-breakpoint
CREATE TYPE "public"."venue_name" AS ENUM('kalshi', 'polymarket');--> statement-breakpoint
CREATE TABLE "event_link_markets" (
	"event_link_id" integer NOT NULL,
	"market_id" integer NOT NULL,
	"alignment" "leg_alignment" DEFAULT 'direct' NOT NULL,
	CONSTRAINT "event_link_markets_event_link_id_market_id_pk" PRIMARY KEY("event_link_id","market_id")
);
--> statement-breakpoint
CREATE TABLE "event_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_question" text NOT NULL,
	"category" text,
	"confidence" numeric(5, 4),
	"rationale" text,
	"source" "link_source" DEFAULT 'manual' NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"resolution_mismatch" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue" "venue_name" NOT NULL,
	"channel" text NOT NULL,
	"last_message_at" timestamp with time zone,
	"state" "feed_state" DEFAULT 'down' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fills" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" integer,
	"venue_id" integer NOT NULL,
	"market_id" integer NOT NULL,
	"side" "side" NOT NULL,
	"quantity" numeric(20, 4) NOT NULL,
	"price" numeric(6, 4) NOT NULL,
	"fee" numeric(12, 6) DEFAULT '0' NOT NULL,
	"external_id" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue" "venue_name",
	"kind" "ingest_kind" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"rows_written" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_detail" jsonb,
	"status" "ingest_status" DEFAULT 'running' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer NOT NULL,
	"external_ticker" text NOT NULL,
	"question" text NOT NULL,
	"category" text,
	"resolution_date" timestamp with time zone,
	"resolution_criteria" text,
	"status" "market_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer NOT NULL,
	"market_id" integer NOT NULL,
	"side" "side" NOT NULL,
	"quantity" numeric(20, 4) NOT NULL,
	"avg_price" numeric(6, 4) NOT NULL,
	"wallet_address" text,
	"source" "position_source" DEFAULT 'manual' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"market_id" integer NOT NULL,
	"yes_bid" numeric(6, 4),
	"yes_ask" numeric(6, 4),
	"mark" numeric(6, 4),
	"ts" timestamp with time zone NOT NULL,
	"source" "price_source" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "venue_name" NOT NULL,
	"base_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "event_link_markets" ADD CONSTRAINT "event_link_markets_event_link_id_event_links_id_fk" FOREIGN KEY ("event_link_id") REFERENCES "public"."event_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_link_markets" ADD CONSTRAINT "event_link_markets_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fills" ADD CONSTRAINT "fills_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fills" ADD CONSTRAINT "fills_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fills" ADD CONSTRAINT "fills_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_status_venue_channel_uq" ON "feed_status" USING btree ("venue","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "markets_venue_ticker_uq" ON "markets" USING btree ("venue_id","external_ticker");--> statement-breakpoint
CREATE INDEX "price_snapshots_market_ts_idx" ON "price_snapshots" USING btree ("market_id","ts" DESC NULLS LAST);