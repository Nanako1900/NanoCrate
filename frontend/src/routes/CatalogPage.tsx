import { useCatalogParams } from '@/hooks/useCatalogParams';
import { useProducts, useProductTypes } from '@/hooks/useProducts';
import { CatalogHero } from '@/components/catalog/CatalogHero';
import { CatalogFilters } from '@/components/catalog/CatalogFilters';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { ProductGridSkeleton } from '@/components/catalog/ProductGridSkeleton';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export function CatalogPage() {
  const { params, setType, setSort, setQuery, setPage } = useCatalogParams();
  const { data: types } = useProductTypes();
  const query = useProducts({
    type: params.type,
    q: params.q || undefined,
    sort: params.sort,
    page: params.page,
    limit: params.limit,
  });

  const isLanding = !params.type && !params.q;
  const featureFirst = isLanding && params.page === 1;

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;
  const total = meta?.total ?? 0;
  const pageCount = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;

  const typeName = params.type
    ? (types?.find((type) => type.key === params.type)?.name ?? params.type)
    : null;
  const heading = params.q ? `Results for “${params.q}”` : (typeName ?? 'All products');

  return (
    <>
      {isLanding && <CatalogHero />}
      <section aria-labelledby="catalog-heading" className="container-page py-8 lg:py-10">
        {isLanding ? (
          <h2 id="catalog-heading" className="sr-only">
            All products
          </h2>
        ) : (
          <h1 id="catalog-heading" className="mb-6 text-2xl font-semibold tracking-tight text-ink">
            {heading}
          </h1>
        )}

        <div className="flex flex-col gap-6">
          <CatalogFilters
            activeType={params.type}
            sort={params.sort}
            query={params.q}
            total={total}
            onTypeChange={setType}
            onSortChange={setSort}
            onClearQuery={() => setQuery('')}
          />

          {/* Keeps the heading order h1 → h2 → h3 on filtered/search views,
              where the page title is the h1 and product cards are h3. */}
          {!isLanding && (
            <h2 className="sr-only">Products</h2>
          )}

          {query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : query.isLoading ? (
            <>
              <span className="sr-only" role="status">
                Loading products…
              </span>
              <ProductGridSkeleton count={params.limit} featureFirst={featureFirst} />
            </>
          ) : items.length === 0 ? (
            <EmptyState
              title="No products match your filters"
              description="Try a different category or clear your search."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setType(undefined);
                    setQuery('');
                  }}
                >
                  Reset filters
                </Button>
              }
            />
          ) : (
            <div className={cn('flex flex-col gap-8', query.isFetching && 'opacity-70 transition-opacity')}>
              <ProductGrid items={items} featureFirst={featureFirst} />
              <Pagination
                page={params.page}
                pageCount={pageCount}
                onPageChange={(page) => {
                  setPage(page);
                  window.scrollTo({ top: 0 });
                }}
              />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
