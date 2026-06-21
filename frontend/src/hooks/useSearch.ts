import { useQuery } from '@tanstack/react-query';
import { searchProducts } from '@/services/api';
import { queryKeys } from '@/services/query-client';

/**
 * Semantic + keyword hybrid search (§9.3 POST /search). Disabled until there's a
 * query so an empty `/search` doesn't fire a request. Results are relevance-
 * ranked hits ({ slug, name, score }).
 */
export function useSearch(query: string, limit = 12) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.search(trimmed, limit),
    queryFn: ({ signal }) => searchProducts(trimmed, limit, signal),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
  });
}
