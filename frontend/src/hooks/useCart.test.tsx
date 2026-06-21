import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/services/query-client';
import { __resetMockStore } from '@/mocks/store';
import { useAddToCart, useCart } from './useCart';

beforeEach(() => {
  __resetMockStore();
});

function createWrapper() {
  const queryClient = createQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useCart + useAddToCart', () => {
  it('optimistically adds an item then reconciles with the server cart', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => ({ cart: useCart(), add: useAddToCart() }), { wrapper });

    await waitFor(() => expect(result.current.cart.isSuccess).toBe(true));
    expect(result.current.cart.data?.item_count).toBe(0);

    act(() => {
      result.current.add.mutate({
        variant_id: 'v_nano75_red',
        qty: 1,
        preview: {
          variant_id: 'v_nano75_red',
          sku: 'NANO75-RED-PBTW',
          name: 'Nano75 · 75% / Red linear / White PBT',
          unit_price_cents: 12900,
          available: 12,
        },
      });
    });

    await waitFor(() => expect(result.current.add.isSuccess).toBe(true));
    expect(result.current.cart.data?.item_count).toBe(1);
    expect(result.current.cart.data?.items[0].sku).toBe('NANO75-RED-PBTW');
    expect(result.current.cart.data?.subtotal_cents).toBe(12900);
  });
});
