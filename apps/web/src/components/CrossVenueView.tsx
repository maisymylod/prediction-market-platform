import type { BasisRow } from '../server/types.js';
import { cents, points } from './format.js';

function Leg({ leg }: { leg: BasisRow['legs'][number] }) {
  return (
    <div className="flex-1 rounded-md border border-edge bg-ink/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs capitalize text-muted">{leg.venue}</span>
        {leg.stale && <span className="text-[10px] font-medium text-warn">STALE</span>}
      </div>
      <div className="mt-0.5 truncate text-xs text-slate-400" title={leg.question}>
        {leg.ticker}
      </div>
      <div className="mt-1 text-2xl tnum text-slate-100" data-cell="leg" data-market={leg.marketId}>
        {cents(leg.yesEquiv)}
      </div>
      <div className="text-[11px] text-muted">YES-equivalent</div>
    </div>
  );
}

export function CrossVenueView({ basis, threshold }: { basis: BasisRow[]; threshold: number }) {
  return (
    <div className="space-y-3 rounded-lg border border-edge bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Cross-venue events
        </h2>
        <span className="text-xs text-muted">flag &gt; {points(threshold)}</span>
      </div>

      {basis.length === 0 && (
        <div className="text-xs text-muted">No confirmed cross-venue links yet.</div>
      )}

      <div className="space-y-3">
        {basis.map((b) => (
          <div
            key={b.eventLinkId}
            data-event-link={b.eventLinkId}
            className={`rounded-lg border p-3 ${
              b.flagged ? 'border-warn/60 bg-warn/5' : 'border-edge bg-ink/20'
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-100">{b.label}</span>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted">basis</span>
                <span className={`tnum font-semibold ${b.flagged ? 'text-warn' : 'text-slate-200'}`}>
                  {points(b.basis)}
                </span>
                {b.flagged && (
                  <span className="rounded bg-warn/20 px-1.5 py-0.5 font-medium text-warn">
                    DIVERGENCE
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              {b.legs.map((leg) => (
                <Leg key={leg.marketId} leg={leg} />
              ))}
            </div>

            {b.resolutionMismatch && (
              <div className="mt-2 rounded border border-danger/50 bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
                ⚠ Resolution criteria differ between venues — these may not resolve together. Basis
                is not a clean arbitrage.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
