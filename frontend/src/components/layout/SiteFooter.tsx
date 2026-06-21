export function SiteFooter() {
  return (
    <footer className="mt-[var(--space-section)] border-t border-line bg-surface">
      <div className="container-page flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">NanoCrate</p>
          <p className="label-mono mt-1 text-2xs uppercase tracking-[0.08em] text-ink-faint">
            Open-source · Apache-2.0 · mock-first storefront
          </p>
        </div>
        <p className="text-2xs text-ink-faint">Reference store · demo data · not a real shop.</p>
      </div>
    </footer>
  );
}
