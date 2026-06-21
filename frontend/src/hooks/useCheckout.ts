import { useMutation, useQueryClient } from '@tanstack/react-query';
import { checkout, confirmMockPayment } from '@/services/api';
import { queryKeys } from '@/services/query-client';
import type { CheckoutResponse, MockPaymentOutcome } from '@/services/types';

/**
 * Mock pay flow: POST /checkout with a simulated outcome, then call the
 * mock-only confirm endpoint (stands in for the Payment Element submit + the
 * async Stripe webhook). Returns the order so the caller can route to the
 * result page, which then polls the order status (SPEC §7).
 */
export function useMockPay(cartId: string) {
  const queryClient = useQueryClient();
  return useMutation<CheckoutResponse, unknown, MockPaymentOutcome>({
    mutationFn: async (outcome) => {
      const result = await checkout(cartId, { mockOutcome: outcome });
      await confirmMockPayment(result.order_id);
      return result;
    },
    onSuccess: () => {
      // A successful confirm clears the server cart; refetch so the badge resets,
      // and refresh the orders list to include the new order.
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

/** Live: create the PaymentIntent and return its client_secret for Stripe Elements. */
export function useCreatePaymentIntent(cartId: string) {
  return useMutation<CheckoutResponse, unknown, void>({
    mutationFn: () => checkout(cartId),
  });
}
