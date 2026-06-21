import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import type { CheckoutResponse } from '@/services/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/services/query-client';
import { server } from '@/mocks/server';
import { __resetMockStore } from '@/mocks/store';
import { addCartItem, getOrders } from '@/services/api';
import { useMockPay } from './useCheckout';

const BASE = '/api/v1';

beforeEach(() => {
  __resetMockStore();
});

function createWrapper() {
  const queryClient = createQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useMockPay idempotency (F3)', () => {
  it('reuses one order across a confirm failure + retry — no duplicate order', async () => {
    const cart = await addCartItem({ variant_id: 'v_nano75_red', qty: 1 });

    // Fail the FIRST confirm so checkout succeeds but the saga errors mid-flight;
    // the retry must NOT create a second order.
    server.use(
      http.post(
        `${BASE}/mock/confirm-payment`,
        () =>
          HttpResponse.json(
            { success: false, data: null, error: { code: 'internal', message: 'transient' } },
            { status: 500 },
          ),
        { once: true },
      ),
    );

    const { result } = renderHook(() => useMockPay(cart.id), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync('succeeded')).rejects.toBeTruthy();
    });

    // Retry — confirm now hits the default (succeeding) handler.
    let order: CheckoutResponse | undefined;
    await act(async () => {
      order = await result.current.mutateAsync('succeeded');
    });

    const list = await getOrders();
    expect(list.orders).toHaveLength(1);
    expect(list.orders[0].id).toBe(order?.order_id);
  });
});
