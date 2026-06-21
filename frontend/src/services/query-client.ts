import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

/**
 * Errors that represent a definitive answer from the server — retrying them
 * just wastes requests and delays the error UI.
 */
const NON_RETRYABLE_CODES = new Set<string>([
  'not_found',
  'validation_failed',
  'unauthorized',
  'forbidden',
  'out_of_stock',
  'conflict',
  'invalid_response',
]);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && NON_RETRYABLE_CODES.has(error.code)) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}

/** Stable query keys so cache entries are shared and invalidation is precise. */
export const queryKeys = {
  productTypes: ['product-types'] as const,
  products: (params: Record<string, unknown>) => ['products', params] as const,
  product: (slug: string) => ['product', slug] as const,
  search: (query: string, limit: number) => ['search', query, limit] as const,
  cart: ['cart'] as const,
  orders: (page: number, limit: number) => ['orders', page, limit] as const,
  order: (id: string) => ['order', id] as const,
};
