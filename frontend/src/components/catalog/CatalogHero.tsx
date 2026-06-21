const STATS: ReadonlyArray<[string, string]> = [
  ['12', 'builds in stock'],
  ['100%', 'hot-swap ready'],
  ['Apache-2.0', 'open source'],
];

/** Editorial landing hero — left-aligned, blueprint texture, spec-strip stats.
 *  Deliberately not a centered headline with a gradient blob. */
export function CatalogHero() {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden border-b border-line bg-paper">
      <div aria-hidden="true" className="bg-blueprint pointer-events-none absolute inset-0" />
      <div className="container-page relative py-[var(--space-section)]">
        <p className="label-mono mb-4">Mechanical keyboards · built to spec</p>
        <h1
          id="hero-heading"
          className="max-w-4xl text-hero font-bold leading-[0.95] tracking-tight text-ink"
        >
          Boards engineered for the <span className="text-accent">feel</span> of every keystroke.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-ink-soft">
          Gasket mounts, hot-swap PCBs, and PBT that lasts. A reference storefront for the NanoCrate
          platform — fork it, restock it, make it yours.
        </p>
        <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
          {STATS.map(([value, label]) => (
            <div key={label} className="flex flex-col">
              <dt className="font-mono text-2xl font-semibold tabular-nums text-ink">{value}</dt>
              <dd className="label-mono">{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
