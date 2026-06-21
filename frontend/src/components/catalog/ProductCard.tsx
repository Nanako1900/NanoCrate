import { Link } from 'react-router-dom';
import type { ProductListItem } from '@/services/types';
import { attributeChips, formatPriceFrom } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

interface ProductCardProps {
  product: ProductListItem;
  featured?: boolean;
  priority?: boolean;
}

/**
 * Editorial product card. Designed states: the whole card lifts (transform),
 * a lift-shadow and an accent keyline reveal (opacity / scaleX), the image
 * eases in (transform), and keyboard focus rings the entire card. All motion
 * stays on compositor-friendly properties.
 */
export function ProductCard({ product, featured = false, priority = false }: ProductCardProps) {
  const chips = attributeChips(product.attributes, featured ? 4 : 3);

  return (
    <article
      className={cn(
        'group relative isolate flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm',
        'transition-transform duration-200 ease-out will-change-transform hover:-translate-y-1',
        featured && 'md:flex-row',
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-lg opacity-0 shadow-lift transition-opacity duration-200 ease-out group-hover:opacity-100"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 rounded-lg opacity-0 ring-2 ring-interactive transition-opacity duration-150 group-focus-within:opacity-100"
      />

      <div
        className={cn(
          'relative z-10 overflow-hidden border-b border-line bg-surface-sunken',
          featured && 'md:w-1/2 md:border-b-0 md:border-r',
        )}
      >
        <img
          src={product.image}
          alt={product.name}
          width={800}
          height={600}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          className="aspect-[4/3] w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-accent transition-transform duration-300 ease-out group-hover:scale-x-100"
        />
      </div>

      <div className={cn('relative z-10 flex flex-1 flex-col gap-3 p-4', featured && 'md:justify-center md:p-7')}>
        <p className="label-mono">{featured ? 'Featured · ' : ''}{product.type}</p>
        <h3 className={cn('font-semibold leading-tight text-ink', featured ? 'text-2xl' : 'text-lg')}>
          <Link to={`/p/${product.slug}`} className="before:absolute before:inset-0 before:z-10">
            {product.name}
          </Link>
        </h3>
        <ul className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li key={chip}>
              <Badge>{chip}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-auto pt-1 font-mono text-base font-medium tabular-nums text-ink">
          {formatPriceFrom(product.price_from_cents, product.currency)}
        </p>
      </div>
    </article>
  );
}
