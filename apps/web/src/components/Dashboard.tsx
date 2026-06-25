import type { DashboardModel } from '../server/types.js';
import { PositionsTable } from './PositionsTable.js';
import { RiskPanel } from './RiskPanel.js';
import { CrossVenueView } from './CrossVenueView.js';
import { StatusBar, type ConnectionState } from './StatusBar.js';

// Presentational shell shared by the static SSR render and the live client
// wrapper (step 4). Takes a fully-computed model; holds no data-loading logic.
export function Dashboard({
  model,
  connection,
  now,
}: {
  model: DashboardModel;
  connection: ConnectionState;
  now: number;
}) {
  return (
    <>
      <StatusBar connection={connection} feeds={model.feeds} />
      <main className="mx-auto max-w-7xl space-y-4 p-4">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Cross-venue risk console</h1>
            <p className="text-xs text-muted">
              Kalshi + Polymarket · one book, one risk view · read-only analytics
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            <div>as of {new Date(model.generatedAt).toLocaleTimeString()}</div>
            {model.pendingLinkCount > 0 && (
              <div className="text-accent">{model.pendingLinkCount} link(s) awaiting confirm</div>
            )}
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <PositionsTable
              positions={model.positions}
              now={now}
              staleThresholdMs={model.staleThresholdMs}
            />
            <CrossVenueView basis={model.basis} threshold={model.basisThreshold} />
          </div>
          <div>
            <RiskPanel
              totals={model.totals}
              exposure={model.exposure}
              worstCase={model.worstCase}
              concentration={model.concentration}
            />
          </div>
        </div>
      </main>
    </>
  );
}
