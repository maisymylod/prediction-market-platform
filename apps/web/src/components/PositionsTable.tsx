import type { PositionRow } from '../server/types.js';
import { ageLabel, cents, money, pnlColor, qty, signedMoney } from './format.js';

function Freshness({
  row,
  now,
  staleThresholdMs,
}: {
  row: PositionRow;
  now: number;
  staleThresholdMs: number;
}) {
  if (!row.priced || row.markTs === null) {
    return (
      <span className="flex items-center gap-1.5 text-stale" title="No mark available">
        <span className="inline-block h-2 w-2 rounded-full bg-stale" /> no mark
      </span>
    );
  }
  const age = now - row.markTs;
  const stale = age > staleThresholdMs;
  return (
    <span
      className={`flex items-center gap-1.5 ${stale ? 'text-warn' : 'text-live'}`}
      title={`Mark ${ageLabel(age)}${stale ? ' — STALE, not treated as live' : ''}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${stale ? 'bg-warn' : 'bg-live'}`} />
      {stale ? 'stale' : 'live'}
    </span>
  );
}

export function PositionsTable({
  positions,
  now,
  staleThresholdMs,
}: {
  positions: PositionRow[];
  now: number;
  staleThresholdMs: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-edge bg-panel">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-2 font-medium">Venue</th>
            <th className="px-3 py-2 font-medium">Market</th>
            <th className="px-3 py-2 font-medium">Side</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 text-right font-medium">Avg</th>
            <th className="px-3 py-2 text-right font-medium">Mark</th>
            <th className="px-3 py-2 text-right font-medium">Value</th>
            <th className="px-3 py-2 text-right font-medium">Unreal. P&amp;L</th>
            <th className="px-3 py-2 font-medium">Fresh</th>
          </tr>
        </thead>
        <tbody className="tnum">
          {positions.map((r) => (
            <tr
              key={r.positionId}
              data-position={r.positionId}
              data-market={r.marketId}
              className="border-b border-edge/60 last:border-0 hover:bg-edge/30"
            >
              <td className="px-3 py-2 capitalize text-slate-300">{r.venue}</td>
              <td className="px-3 py-2">
                <div className="font-medium text-slate-100">{r.ticker}</div>
                <div className="max-w-[340px] truncate text-xs text-muted" title={r.question}>
                  {r.question}
                </div>
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                    r.side === 'yes' ? 'bg-sky-950 text-sky-300' : 'bg-fuchsia-950 text-fuchsia-300'
                  }`}
                >
                  {r.side.toUpperCase()}
                </span>
              </td>
              <td className="px-3 py-2 text-right text-slate-300">{qty(r.quantity)}</td>
              <td className="px-3 py-2 text-right text-slate-300">{cents(r.avgPrice)}</td>
              <td className="px-3 py-2 text-right text-slate-100" data-cell="mark">
                {cents(r.mark)}
              </td>
              <td className="px-3 py-2 text-right text-slate-100" data-cell="value">
                {money(r.marketValue)}
              </td>
              <td className={`px-3 py-2 text-right ${pnlColor(r.unrealizedPnl)}`} data-cell="pnl">
                {signedMoney(r.unrealizedPnl)}
              </td>
              <td className="px-3 py-2">
                <Freshness row={r} now={now} staleThresholdMs={staleThresholdMs} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
