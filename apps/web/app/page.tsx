import { loadDashboard } from '../src/server/data.js';
import { env } from '../src/server/config.js';
import { LiveDashboard } from '../src/components/LiveDashboard.js';

// Render a fresh SSR baseline from the DB, then the client layers SSE deltas on
// top — no full page reload, no manual refresh.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const now = Date.now();
  const { model, bootstrap } = await loadDashboard(now);
  return <LiveDashboard bootstrap={bootstrap} initialModel={model} debounceMs={env.DEBOUNCE_MS} />;
}
