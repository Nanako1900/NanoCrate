import type { ProductListItem } from '@/services/types';
import { ProductCard } from './ProductCard';
import { cn } from '@/lib/cn';

interface ProductGridProps {
  items: ProductListItem[];
  featureFirst?: boolean;
}

/** Grid-breaking editorial layout: an optional featured first item spans two
 *  columns to establish rhythm rather than a uniform card grid. */
export function ProductGrid({ items, featureFirst = false }: ProductGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => {
        const featured = featureFirst && index === 0;
        return (
          <li key={item.slug} className={cn('flex', featured && 'sm:col-span-2')}>
            <ProductCard product={item} featured={featured} priority={index < 2} />
          </li>
        );
      })}
    </ul>
  );
}
