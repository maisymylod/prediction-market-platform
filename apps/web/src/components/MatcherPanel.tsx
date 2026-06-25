'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PendingLink } from '../server/types.js';
import { pct } from './format.js';

async function post(body: unknown): Promise<{ ok?: boolean; error?: string; created?: number }> {
  const res = await fetch('/api/matcher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function MatcherPanel({
  pendingLinks,
  matcherEnabled,
}: {
  pendingLinks: PendingLink[];
  matcherEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async (id: string, body: unknown) => {
    setBusy(id);
    setNote(null);
    const r = await post(body);
    if (r.error) setNote(r.error);
    else if (typeof r.created === 'number') setNote(`Proposed ${r.created} new link(s).`);
    setBusy(null);
    router.refresh();
  };

  return (
    <div className="space-y-3 rounded-lg border border-edge bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Cross-venue matcher
        </h2>
        <button
          disabled={!matcherEnabled || busy !== null}
          onClick={() => run('suggest', { action: 'suggest' })}
          className="rounded bg-accent/20 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
          title={matcherEnabled ? 'Use the LLM to propose matches' : 'Set ANTHROPIC_API_KEY to enable'}
        >
          {busy === 'suggest' ? 'Thinking…' : 'Suggest matches (AI)'}
        </button>
      </div>

      {!matcherEnabled && (
        <p className="text-xs text-muted">
          AI matching is disabled. Set <code className="text-slate-300">ANTHROPIC_API_KEY</code> to
          propose links. Seed ships pre-confirmed links so the cross-venue view still works.
        </p>
      )}
      {note && <p className="text-xs text-accent">{note}</p>}

      {pendingLinks.length === 0 ? (
        <p className="text-xs text-muted">No links awaiting review.</p>
      ) : (
        <ul className="space-y-2">
          {pendingLinks.map((l) => (
            <li key={l.eventLinkId} className="rounded-md border border-edge bg-ink/30 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-100">{l.label}</span>
                {l.confidence !== null && (
                  <span className="tnum text-xs text-muted">{pct(l.confidence)} conf.</span>
                )}
              </div>
              <div className="mt-1 space-y-0.5 text-xs text-muted">
                {l.legs.map((leg) => (
                  <div key={leg.ticker}>
                    <span className="capitalize text-slate-300">{leg.venue}</span> · {leg.ticker} —{' '}
                    <span title={leg.question}>{leg.question}</span>
                  </div>
                ))}
              </div>
              {l.rationale && <p className="mt-1 text-xs italic text-slate-400">{l.rationale}</p>}
              {l.resolutionMismatch && (
                <p className="mt-1 text-xs text-danger">
                  ⚠ Possible resolution-criteria mismatch — review carefully before confirming.
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  disabled={busy !== null}
                  onClick={() => run(l.eventLinkId, { action: 'confirm', eventLinkId: l.eventLinkId })}
                  className="rounded bg-live/20 px-2 py-0.5 text-xs font-medium text-live hover:bg-live/30 disabled:opacity-40"
                >
                  Confirm
                </button>
                <button
                  disabled={busy !== null}
                  onClick={() => run(l.eventLinkId, { action: 'reject', eventLinkId: l.eventLinkId })}
                  className="rounded bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger hover:bg-danger/25 disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
