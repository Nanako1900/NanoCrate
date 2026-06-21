import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProductDetail as ProductDetailModel, Variant } from '@/services/types';
import { formatPrice } from '@/lib/format';
import { productImageSrc } from '@/lib/productImage';
import { Button } from '@/components/ui/Button';
import { StockIndicator } from '@/components/ui/StockIndicator';
import { VariantPicker } from './VariantPicker';
import { SpecList } from './SpecList';

function defaultVariant(variants: Variant[]): Variant | undefined {
  return variants.find((variant) => variant.available > 0) ?? variants[0];
}

interface ProductDetailProps {
  product: ProductDetailModel;
}

export function ProductDetail({ product }: ProductDetailProps) {
  const [selectedId, setSelectedId] = useState<string>(() => defaultVariant(product.variants)?.id ?? '');
  const [added, setAdded] = useState(false);

  const selected = useMemo(
    () => product.variants.find((variant) => variant.id === selectedId) ?? defaultVariant(product.variants),
    [product.variants, selectedId],
  );
  const soldOut = !selected || selected.available <= 0;

  function handleSelect(id: string) {
    setSelectedId(id);
    setAdded(false);
  }

  return (
    <article className="container-page py-8 lg:py-12">
      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center text-sm text-ink-soft">
        <Link to="/" className="rounded-sm transition-colors hover:text-ink">
          Catalog
        </Link>
        <span className="px-2 text-ink-faint" aria-hidden="true">/</span>
        <Link to={`/?type=${product.type}`} className="rounded-sm transition-colors hover:text-ink">
          {product.type}
        </Link>
        <span className="px-2 text-ink-faint" aria-hidden="true">/</span>
        <span className="text-ink" aria-current="page">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Media. The detail contract (§9.3) omits an image field — see the
            CONTRACT GAP note in lib/productImage.ts. Eager LCP hero. */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-lg border border-line bg-surface-sunken">
            <img
              src={productImageSrc(product.slug)}
              alt={product.name}
              width={800}
              height={600}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-3">
            <p className="label-mono">{product.type}</p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">{product.name}</h1>
            <div className="flex items-center gap-3">
              <p className="font-mono text-2xl font-medium tabular-nums text-ink">
                {selected ? formatPrice(selected.price_cents, selected.currency) : '—'}
              </p>
              {selected && <StockIndicator available={selected.available} />}
            </div>
          </header>

          <p className="max-w-prose text-ink-soft">{product.description}</p>

          <VariantPicker variants={product.variants} selectedId={selected?.id ?? ''} onSelect={handleSelect} />

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => setAdded(true)}
              disabled={soldOut}
              size="md"
              className="w-full sm:w-auto sm:min-w-56"
            >
              {soldOut ? 'Out of stock' : 'Add to cart'}
            </Button>
            <p aria-live="polite" className="text-2xs text-ink-faint">
              {added && !soldOut
                ? `Added ${selected?.sku} — cart & checkout arrive in Phase 2.`
                : 'Cart & checkout arrive in Phase 2 of this mock-first build.'}
            </p>
          </div>

          <section aria-labelledby="specs-heading" className="flex flex-col gap-3">
            <h2 id="specs-heading" className="label-mono">
              Specifications
            </h2>
            <SpecList attributes={product.attributes} />
          </section>
        </div>
      </div>
    </article>
  );
}
