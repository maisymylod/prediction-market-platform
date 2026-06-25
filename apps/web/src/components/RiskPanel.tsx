import type {
  ConcentrationResult,
  ExposureResult,
  PortfolioTotals,
  WorstCaseResult,
} from '@pmp/core';
import { money, pct, pnlColor, signedMoney } from './format.js';

function Stat({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-md border border-edge bg-ink/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 text-lg tnum ${cls}`}>{value}</div>
    </div>
  );
}

function Bars({ groups }: { groups: ConcentrationResult['byCategory'] }) {
  if (groups.length === 0) return <div className="text-xs text-muted">No priced positions.</div>;
  return (
    <div className="space-y-1.5">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="flex justify-between text-xs">
            <span className="text-slate-300">{g.key}</span>
            <span className="tnum text-muted">
              {money(g.value)} · {pct(g.pct)}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-edge">
            <div className="h-full rounded bg-accent" style={{ width: `${Math.round(g.pct * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RiskPanel({
  totals,
  exposure,
  worstCase,
  concentration,
}: {
  totals: PortfolioTotals;
  exposure: ExposureResult;
  worstCase: WorstCaseResult;
  concentration: ConcentrationResult;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-edge bg-panel p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Risk</h2>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Market value" value={money(totals.marketValue)} />
        <Stat
          label="Unrealized P&L"
          value={signedMoney(totals.unrealizedPnl)}
          cls={pnlColor(totals.unrealizedPnl)}
        />
        <Stat label="Gross exposure" value={money(exposure.grossExposure)} />
        <Stat label="Net (YES-equiv)" value={money(exposure.netExposure)} />
      </div>

      <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-danger/80">
          Worst-case loss (all events resolve against you)
        </div>
        <div className="mt-0.5 text-2xl tnum text-danger">{money(worstCase.worstCaseLoss)}</div>
        {worstCase.byEvent[0] && (
          <div className="mt-1 text-xs text-muted">
            Largest single-event risk:{' '}
            <span className="text-slate-300">{worstCase.byEvent[0].label}</span> (
            {signedMoney(worstCase.byEvent[0].worstPnl)} if{' '}
            {worstCase.byEvent[0].worstOutcome.toUpperCase()})
          </div>
        )}
      </div>

      {(totals.unpricedCount > 0 || totals.staleCount > 0) && (
        <div className="text-xs text-warn">
          {totals.unpricedCount > 0 && <span>{totals.unpricedCount} unpriced (excluded). </span>}
          {totals.staleCount > 0 && <span>{totals.staleCount} stale mark(s) in aggregates.</span>}
        </div>
      )}

      <div>
        <div className="mb-1.5 text-xs uppercase tracking-wide text-muted">By category</div>
        <Bars groups={concentration.byCategory} />
      </div>
      <div>
        <div className="mb-1.5 text-xs uppercase tracking-wide text-muted">By thematic cluster</div>
        <Bars groups={concentration.byCluster} />
      </div>
    </div>
  );
}
