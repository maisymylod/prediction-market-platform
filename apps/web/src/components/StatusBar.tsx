import type { FeedRow } from '../server/types.js';
import { ageLabel } from './format.js';

export type ConnectionState = 'live' | 'connecting' | 'reconnecting' | 'offline' | 'seed';

const connMeta: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  live: { label: 'Live', dot: 'bg-live', text: 'text-live' },
  connecting: { label: 'Connecting…', dot: 'bg-warn animate-pulse', text: 'text-warn' },
  reconnecting: { label: 'Reconnecting…', dot: 'bg-warn animate-pulse', text: 'text-warn' },
  offline: { label: 'Offline', dot: 'bg-danger', text: 'text-danger' },
  seed: { label: 'Seed data', dot: 'bg-stale', text: 'text-stale' },
};

const feedDot: Record<FeedRow['state'], string> = {
  live: 'bg-live',
  stale: 'bg-warn',
  reconnecting: 'bg-warn animate-pulse',
  down: 'bg-stale',
};

export function StatusBar({
  connection,
  feeds,
}: {
  connection: ConnectionState;
  feeds: FeedRow[];
}) {
  const c = connMeta[connection];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-edge bg-panel px-4 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${c.dot}`} />
        <span className={`font-medium ${c.text}`}>{c.label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {feeds.map((f) => (
          <div
            key={`${f.venue}:${f.channel}`}
            className="flex items-center gap-1.5 text-muted"
            title={`${f.venue}/${f.channel} — ${f.state}, ${ageLabel(f.ageMs)}`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${feedDot[f.state]}`} />
            <span className="text-slate-300">{f.venue}</span>
            <span className="text-muted">/{f.channel}</span>
            {f.state === 'stale' && <span className="text-warn">stale</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
