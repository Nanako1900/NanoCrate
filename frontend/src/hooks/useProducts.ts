import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getProductTypes, getProducts } from '@/services/api';
import { queryKeys } from '@/services/query-client';
import type { ProductListParams } from '@/services/types';

/** Paginated/filtered product list. Keeps previous page visible while fetching
 *  the next, so pagination and filtering never flash an empty layout. */
export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: queryKeys.products(params as Record<string, unknown>),
    queryFn: ({ signal }) => getProducts(params, signal),
    placeholderData: keepPreviousData,
  });
}

/** Category templates for the catalog filter (cached aggressively — rarely changes). */
export function useProductTypes() {
  return useQuery({
    queryKey: queryKeys.productTypes,
    queryFn: ({ signal }) => getProductTypes(signal),
    staleTime: 5 * 60_000,
  });
}
