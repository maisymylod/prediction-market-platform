// Display formatting. Prediction-market prices are quoted in cents (price * 100).

export const dash = '—';

export function cents(p: number | null | undefined): string {
  if (p === null || p === undefined) return dash;
  return `${(p * 100).toFixed(1)}¢`;
}

export function points(p: number | null | undefined): string {
  if (p === null || p === undefined) return dash;
  return `${(p * 100).toFixed(1)} pts`;
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return dash;
  return `$${n.toFixed(2)}`;
}

export function signedMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return dash;
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return dash;
  return `${(n * 100).toFixed(1)}%`;
}

export function qty(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

export function pnlColor(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'text-muted';
  if (n > 0) return 'text-live';
  if (n < 0) return 'text-danger';
  return 'text-slate-300';
}

export function ageLabel(ms: number | null): string {
  if (ms === null) return 'no data';
  if (ms < 1000) return `${ms}ms ago`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}
