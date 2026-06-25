// Persistent, plain-language disclaimer (hard constraint #5). Rendered sticky in
// the layout so it is always visible on every screen.
export function Disclaimer() {
  return (
    <div className="sticky top-0 z-40 border-b border-edge bg-amber-950/40 px-4 py-1.5 text-center text-xs text-amber-200">
      <span className="font-semibold">For analytics only — not financial advice.</span>{' '}
      No guaranteed returns. Event contracts are regulated financial products and can resolve to
      zero. Any suggested sizing is a reference number, not a recommendation.
    </div>
  );
}
