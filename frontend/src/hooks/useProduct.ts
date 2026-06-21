import { useQuery } from '@tanstack/react-query';
import { getProduct } from '@/services/api';
import { queryKeys } from '@/services/query-client';

/** Single product detail (with variants + availability) by slug. */
export function useProduct(slug: string) {
  return useQuery({
    queryKey: queryKeys.product(slug),
    queryFn: ({ signal }) => getProduct(slug, signal),
    enabled: Boolean(slug),
  });
}
