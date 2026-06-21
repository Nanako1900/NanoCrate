import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getOrder, getOrders } from '@/services/api';
import { queryKeys } from '@/services/query-client';

export function useOrders(page = 1, limit = 20) {
  return useQuery({
    queryKey: queryKeys.orders(page, limit),
    queryFn: ({ signal }) => getOrders(page, limit, signal),
    placeholderData: keepPreviousData,
  });
}

/**
 * Single order. When `poll` is true (the checkout result page), it refetches
 * every second while the order is still `pending` — modeling the async Stripe
 * webhook the result page waits for — and stops once the status is terminal.
 */
export function useOrder(id: string, options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.order(id),
    queryFn: ({ signal }) => getOrder(id, signal),
    enabled: Boolean(id),
    refetchInterval: options.poll
      ? (query) => (query.state.data?.status === 'pending' ? 1000 : false)
      : false,
  });
}
