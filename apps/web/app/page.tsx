import { loadDashboard } from '../src/server/data.js';
import { Dashboard } from '../src/components/Dashboard.js';

// Always render fresh from the DB; the live spine (step 4) layers SSE deltas on
// top of this SSR baseline.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const now = Date.now();
  const model = await loadDashboard(now);
  return <Dashboard model={model} connection="seed" now={now} />;
}
