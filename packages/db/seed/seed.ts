import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createDb } from '../src/client.js';

// Load the repo-root .env regardless of the package cwd pnpm runs us from.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../../.env') });
import {
  venues,
  markets,
  eventLinks,
  eventLinkMarkets,
  positions,
  priceSnapshots,
  feedStatus,
} from '../src/schema.js';

// Helpers to format numeric columns (Drizzle numeric wants strings).
const p = (x: number) => x.toFixed(4); // probability
const q = (x: number) => x.toFixed(4); // quantity

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgres://pmp:pmp@localhost:5432/pmp';
  const { db, close } = createDb(url, { max: 1 });
  const now = new Date();
  const resolutionDate = new Date('2026-12-31T23:59:59Z');

  console.log('[seed] clearing existing data');
  // Order matters for FKs.
  await db.delete(priceSnapshots);
  await db.delete(eventLinkMarkets);
  await db.delete(positions);
  await db.delete(eventLinks);
  await db.delete(markets);
  await db.delete(feedStatus);
  await db.delete(venues);

  console.log('[seed] venues');
  const [kalshi, poly] = await db
    .insert(venues)
    .values([
      { name: 'kalshi', baseUrl: 'https://demo-api.kalshi.co/trade-api/v2' },
      { name: 'polymarket', baseUrl: 'https://clob.polymarket.com' },
    ])
    .returning();
  if (!kalshi || !poly) throw new Error('venue insert failed');

  console.log('[seed] markets');
  const m = await db
    .insert(markets)
    .values([
      // --- Kalshi ---
      {
        venueId: kalshi.id,
        externalTicker: 'KXFEDDECISION-26DEC-CUT',
        question: 'Will the Fed cut its target rate at the December 2026 meeting?',
        category: 'Economics',
        resolutionDate,
        resolutionCriteria:
          'Resolves YES if the FOMC lowers the upper bound of the federal funds target range at the December 2026 meeting.',
        status: 'active',
      },
      {
        venueId: kalshi.id,
        externalTicker: 'KXBTC-26DEC-150K',
        question: 'Will Bitcoin be above $150,000 on Dec 31, 2026?',
        category: 'Crypto',
        resolutionDate,
        resolutionCriteria:
          'Resolves YES if the Kalshi BTC reference price is at or above $150,000 at 5pm ET on Dec 31, 2026.',
        status: 'active',
      },
      {
        venueId: kalshi.id,
        externalTicker: 'KXCPIYOY-26DEC-3',
        question: 'Will headline CPI year-over-year exceed 3% in the Dec 2026 report?',
        category: 'Economics',
        resolutionDate,
        resolutionCriteria:
          'Resolves YES if HEADLINE CPI-U year-over-year, as published by BLS for December 2026, exceeds 3.0%.',
        status: 'active',
      },
      {
        venueId: kalshi.id,
        externalTicker: 'KXPRES28-GOP',
        question: 'Will a Republican win the 2028 US presidential election?',
        category: 'Politics',
        resolutionDate: new Date('2028-12-31T23:59:59Z'),
        resolutionCriteria:
          'Resolves YES if the Republican nominee wins a majority of electoral college votes in the 2028 election.',
        status: 'active',
      },
      {
        venueId: kalshi.id,
        externalTicker: 'KXSB61-KC',
        question: 'Will the Kansas City Chiefs win Super Bowl LXI?',
        category: 'Sports',
        resolutionDate: new Date('2027-02-14T23:59:59Z'),
        resolutionCriteria: 'Resolves YES if the Chiefs win Super Bowl LXI.',
        status: 'active',
      },
      // --- Polymarket ---
      {
        venueId: poly.id,
        externalTicker: '0xfed26dec',
        question: 'Fed decreases interest rates at the December 2026 meeting?',
        category: 'Economics',
        resolutionDate,
        resolutionCriteria:
          'Resolves YES if the FOMC announces a decrease to the federal funds target rate at its December 2026 meeting.',
        status: 'active',
      },
      {
        venueId: poly.id,
        externalTicker: '0xbtc150k26',
        question: 'Bitcoin above $150k at the end of 2026?',
        category: 'Crypto',
        resolutionDate,
        resolutionCriteria:
          'Resolves YES if the price of Bitcoin is above $150,000 according to the resolution source on Dec 31, 2026.',
        status: 'active',
      },
      {
        venueId: poly.id,
        externalTicker: '0xcorecpi26dec',
        question: 'Core CPI above 3% for December 2026?',
        category: 'Economics',
        resolutionDate,
        // NOTE: CORE, not headline — a real resolution-criteria trap vs the Kalshi leg.
        resolutionCriteria:
          'Resolves YES if CORE CPI (ex food & energy) year-over-year for December 2026 exceeds 3.0%.',
        status: 'active',
      },
      {
        venueId: poly.id,
        externalTicker: '0xgop2028',
        question: 'Will Republicans win the 2028 US Presidential Election?',
        category: 'Politics',
        resolutionDate: new Date('2028-12-31T23:59:59Z'),
        resolutionCriteria:
          'Resolves YES if the Republican Party candidate wins the 2028 US presidential election.',
        status: 'active',
      },
    ])
    .returning();

  const byTicker = Object.fromEntries(m.map((row) => [row.externalTicker, row]));
  const mk = (t: string) => {
    const row = byTicker[t];
    if (!row) throw new Error(`seed market not found: ${t}`);
    return row;
  };

  console.log('[seed] event links');
  const links = await db
    .insert(eventLinks)
    .values([
      {
        canonicalQuestion: 'Fed cuts rates at the December 2026 meeting',
        category: 'Economics',
        confidence: '0.9700',
        rationale:
          'Both reference the same FOMC December 2026 rate decision with equivalent resolution criteria.',
        source: 'manual',
        confirmed: true,
        resolutionMismatch: false,
        confirmedAt: now,
      },
      {
        canonicalQuestion: 'Bitcoin above $150k at end of 2026',
        category: 'Crypto',
        confidence: '0.9500',
        rationale: 'Same threshold ($150k) and same resolution date; minor reference-price differences.',
        source: 'manual',
        confirmed: true,
        resolutionMismatch: false,
        confirmedAt: now,
      },
      {
        canonicalQuestion: 'December 2026 CPI above 3%',
        category: 'Economics',
        confidence: '0.7800',
        rationale:
          'Both about Dec 2026 CPI > 3%, BUT Kalshi resolves on HEADLINE CPI and Polymarket on CORE CPI — these can diverge materially.',
        source: 'manual',
        confirmed: true,
        resolutionMismatch: true, // the trap
        confirmedAt: now,
      },
      {
        canonicalQuestion: 'Republican wins the 2028 US presidential election',
        category: 'Politics',
        confidence: '0.9300',
        rationale: 'Same election, same party outcome, equivalent criteria.',
        source: 'manual',
        confirmed: true,
        resolutionMismatch: false,
        confirmedAt: now,
      },
    ])
    .returning();
  const [fedLink, btcLink, cpiLink, gopLink] = links;
  if (!fedLink || !btcLink || !cpiLink || !gopLink) throw new Error('event link insert failed');

  console.log('[seed] event link <-> market mappings');
  await db.insert(eventLinkMarkets).values([
    { eventLinkId: fedLink.id, marketId: mk('KXFEDDECISION-26DEC-CUT').id, alignment: 'direct' },
    { eventLinkId: fedLink.id, marketId: mk('0xfed26dec').id, alignment: 'direct' },
    { eventLinkId: btcLink.id, marketId: mk('KXBTC-26DEC-150K').id, alignment: 'direct' },
    { eventLinkId: btcLink.id, marketId: mk('0xbtc150k26').id, alignment: 'direct' },
    { eventLinkId: cpiLink.id, marketId: mk('KXCPIYOY-26DEC-3').id, alignment: 'direct' },
    { eventLinkId: cpiLink.id, marketId: mk('0xcorecpi26dec').id, alignment: 'direct' },
    { eventLinkId: gopLink.id, marketId: mk('KXPRES28-GOP').id, alignment: 'direct' },
    { eventLinkId: gopLink.id, marketId: mk('0xgop2028').id, alignment: 'direct' },
  ]);

  console.log('[seed] positions (multi-venue portfolio)');
  await db.insert(positions).values([
    // Fed: long on Kalshi, hedged short (NO) on Polymarket.
    { venueId: kalshi.id, marketId: mk('KXFEDDECISION-26DEC-CUT').id, side: 'yes', quantity: q(200), avgPrice: p(0.45) },
    { venueId: poly.id, marketId: mk('0xfed26dec').id, side: 'no', quantity: q(150), avgPrice: p(0.5), walletAddress: '0xDEMOdemoDEMOdemoDEMOdemoDEMOdemo00000001' },
    // BTC: long both venues.
    { venueId: kalshi.id, marketId: mk('KXBTC-26DEC-150K').id, side: 'yes', quantity: q(100), avgPrice: p(0.3) },
    { venueId: poly.id, marketId: mk('0xbtc150k26').id, side: 'yes', quantity: q(80), avgPrice: p(0.33), walletAddress: '0xDEMOdemoDEMOdemoDEMOdemoDEMOdemo00000001' },
    // CPI: long Kalshi headline only (the leg with the criteria trap).
    { venueId: kalshi.id, marketId: mk('KXCPIYOY-26DEC-3').id, side: 'yes', quantity: q(120), avgPrice: p(0.4) },
    // 2028 GOP: long Kalshi, short Polymarket.
    { venueId: kalshi.id, marketId: mk('KXPRES28-GOP').id, side: 'yes', quantity: q(300), avgPrice: p(0.52) },
    { venueId: poly.id, marketId: mk('0xgop2028').id, side: 'no', quantity: q(100), avgPrice: p(0.45), walletAddress: '0xDEMOdemoDEMOdemoDEMOdemoDEMOdemo00000001' },
    // Sports: unlinked single-venue position.
    { venueId: kalshi.id, marketId: mk('KXSB61-KC').id, side: 'yes', quantity: q(50), avgPrice: p(0.2) },
  ]);

  console.log('[seed] initial price snapshots');
  const marksByTicker: Record<string, { bid: number; ask: number; mark: number }> = {
    'KXFEDDECISION-26DEC-CUT': { bid: 0.47, ask: 0.49, mark: 0.48 },
    '0xfed26dec': { bid: 0.5, ask: 0.52, mark: 0.51 },
    'KXBTC-26DEC-150K': { bid: 0.33, ask: 0.35, mark: 0.34 },
    '0xbtc150k26': { bid: 0.36, ask: 0.38, mark: 0.37 },
    'KXCPIYOY-26DEC-3': { bid: 0.41, ask: 0.44, mark: 0.42 },
    '0xcorecpi26dec': { bid: 0.3, ask: 0.33, mark: 0.31 },
    'KXPRES28-GOP': { bid: 0.53, ask: 0.55, mark: 0.54 },
    '0xgop2028': { bid: 0.5, ask: 0.52, mark: 0.51 },
    'KXSB61-KC': { bid: 0.21, ask: 0.24, mark: 0.22 },
  };
  await db.insert(priceSnapshots).values(
    Object.entries(marksByTicker).map(([ticker, v]) => ({
      marketId: mk(ticker).id,
      yesBid: p(v.bid),
      yesAsk: p(v.ask),
      mark: p(v.mark),
      ts: now,
      source: 'reconcile' as const,
    })),
  );

  console.log('[seed] feed status rows');
  await db.insert(feedStatus).values([
    { venue: 'kalshi', channel: 'ticker', state: 'down', lastMessageAt: null },
    { venue: 'polymarket', channel: 'poll', state: 'down', lastMessageAt: null },
  ]);

  await close();
  console.log('[seed] done');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
