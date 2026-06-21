import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ProductSort } from '@/services/types';

/**
 * Catalog state lives entirely in URL search params (shareable, back/forward
 * friendly): `?type=&q=&sort=&page=`. Defaults are omitted from the URL to keep
 * it clean. Changing type/query/sort resets pagination to page 1.
 */
export const CATALOG_PAGE_SIZE = 9;

export interface ResolvedCatalogParams {
  type?: string;
  q: string;
  sort: ProductSort;
  page: number;
  limit: number;
}

function parseSort(value: string | null): ProductSort {
  return value === 'price_asc' || value === 'price_desc' || value === 'newest' ? value : 'newest';
}

function parsePage(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export interface CatalogParamsApi {
  params: ResolvedCatalogParams;
  setType: (type: string | undefined) => void;
  setSort: (sort: ProductSort) => void;
  setQuery: (q: string) => void;
  setPage: (page: number) => void;
}

export function useCatalogParams(): CatalogParamsApi {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<ResolvedCatalogParams>(
    () => ({
      type: searchParams.get('type') || undefined,
      q: searchParams.get('q') ?? '',
      sort: parseSort(searchParams.get('sort')),
      page: parsePage(searchParams.get('page')),
      limit: CATALOG_PAGE_SIZE,
    }),
    [searchParams],
  );

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void, resetPage = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          if (resetPage) next.delete('page');
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const setType = useCallback(
    (type: string | undefined) =>
      update((next) => (type ? next.set('type', type) : next.delete('type')), true),
    [update],
  );

  const setSort = useCallback(
    (sort: ProductSort) =>
      update((next) => (sort === 'newest' ? next.delete('sort') : next.set('sort', sort)), true),
    [update],
  );

  const setQuery = useCallback(
    (q: string) => update((next) => (q ? next.set('q', q) : next.delete('q')), true),
    [update],
  );

  const setPage = useCallback(
    (page: number) => update((next) => (page <= 1 ? next.delete('page') : next.set('page', String(page)))),
    [update],
  );

  return { params, setType, setSort, setQuery, setPage };
}
