import { useEffect, useState } from 'react';
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

const POLL_INTERVAL_MS = 1000;
/** Stop polling after this long stuck in `pending` and surface a fallback. */
const DEFAULT_POLL_TIMEOUT_MS = 30_000;

export interface UseOrderOptions {
  poll?: boolean;
  /** Upper bound on polling while `pending`; overridable for tests. */
  pollTimeoutMs?: number;
}

/**
 * Single order. When `poll` is true (the checkout result page) it refetches
 * every second while the order is still `pending` — modeling the async Stripe
 * webhook — and stops once the status is terminal OR `pollTimeoutMs` elapses,
 * exposing `isPollingTimedOut` so the UI can show a "still processing, check My
 * Orders" fallback instead of spinning forever.
 */
export function useOrder(id: string, options: UseOrderOptions = {}) {
  const { poll = false, pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS } = options;
  const [timedOut, setTimedOut] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.order(id),
    queryFn: ({ signal }) => getOrder(id, signal),
    enabled: Boolean(id),
    // Stop polling on a terminal status or once we've timed out waiting.
    refetchInterval:
      poll && !timedOut
        ? (q) => (q.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false)
        : false,
  });

  const isWaiting = poll && (query.isLoading || query.data?.status === 'pending');

  useEffect(() => {
    if (!isWaiting) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), pollTimeoutMs);
    return () => clearTimeout(timer);
  }, [isWaiting, pollTimeoutMs]);

  return { ...query, isPollingTimedOut: isWaiting && timedOut };
}
