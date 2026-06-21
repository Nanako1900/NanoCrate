import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/services/query-client';
import { __resetMockStore } from '@/mocks/store';
import { addCartItem, checkout, confirmMockPayment } from '@/services/api';
import { useOrder } from './useOrders';

beforeEach(() => {
  __resetMockStore();
});

function createWrapper() {
  const queryClient = createQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useOrder polling timeout (F9)', () => {
  it('stops polling and flags a timeout when an order stays pending', async () => {
    // Checkout creates the order but we never confirm it → perpetually pending.
    const cart = await addCartItem({ variant_id: 'v_nano75_red', qty: 1 });
    const { order_id } = await checkout(cart.id, { mockOutcome: 'succeeded' });

    const { result } = renderHook(
      () => useOrder(order_id, { poll: true, pollTimeoutMs: 30 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data?.status).toBe('pending'));
    await waitFor(() => expect(result.current.isPollingTimedOut).toBe(true));
  });

  it('does not flag a timeout for an already-settled order', async () => {
    const cart = await addCartItem({ variant_id: 'v_nano75_red', qty: 1 });
    const { order_id } = await checkout(cart.id, { mockOutcome: 'succeeded' });
    await confirmMockPayment(order_id); // settle first (instant in test mode)

    const { result } = renderHook(
      () => useOrder(order_id, { poll: true, pollTimeoutMs: 20 }),
      { wrapper: createWrapper() },
    );

    // First fetch already returns a terminal status → no polling, no timeout.
    await waitFor(() => expect(result.current.data?.status).toBe('paid'));
    expect(result.current.isPollingTimedOut).toBe(false);
  });
});
