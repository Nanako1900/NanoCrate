import type { ReactNode } from 'react';
import { useProductTypes } from '@/hooks/useProducts';
import { pluralize } from '@/lib/format';
import type { ProductSort } from '@/services/types';
import { cn } from '@/lib/cn';

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

function Chip({ active, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm transition-[transform,background-color,border-color,color] duration-150 ease-out active:translate-y-px',
        active
          ? 'border-transparent bg-ink text-ink-invert'
          : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

interface CatalogFiltersProps {
  activeType?: string;
  sort: ProductSort;
  query: string;
  total: number;
  onTypeChange: (type: string | undefined) => void;
  onSortChange: (sort: ProductSort) => void;
  onClearQuery: () => void;
}

export function CatalogFilters({
  activeType,
  sort,
  query,
  total,
  onTypeChange,
  onSortChange,
  onClearQuery,
}: CatalogFiltersProps) {
  const { data: types } = useProductTypes();

  return (
    <section aria-label="Catalog filters" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
          <Chip active={!activeType} onClick={() => onTypeChange(undefined)}>
            All
          </Chip>
          {types?.map((type) => (
            <Chip key={type.key} active={activeType === type.key} onClick={() => onTypeChange(type.key)}>
              {type.name}
              {typeof type.product_count === 'number' && (
                <span className="font-mono text-2xs tabular-nums text-ink-faint">{type.product_count}</span>
              )}
            </Chip>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="catalog-sort" className="label-mono">
            Sort
          </label>
          <select
            id="catalog-sort"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as ProductSort)}
            className="h-9 rounded-md border border-line bg-surface px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong"
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
        {/* Only the count is a live region — keep the clear-search button out of
            it so toggling the search doesn't re-announce the whole button. */}
        <span role="status">
          <span className="font-mono tabular-nums text-ink">{total}</span> {pluralize(total, 'result')}
        </span>
        {query && (
          <button
            type="button"
            onClick={onClearQuery}
            className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 text-sm text-ink transition-colors duration-150 hover:border-line-strong"
          >
            <span className="text-ink-faint">search:</span>
            <span className="font-medium">{query}</span>
            <span aria-hidden="true">✕</span>
            <span className="sr-only">Clear search</span>
          </button>
        )}
      </div>
    </section>
  );
}
