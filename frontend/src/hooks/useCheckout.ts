import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { checkout, confirmMockPayment } from '@/services/api';
import { queryKeys } from '@/services/query-client';
import type { CheckoutResponse, MockPaymentOutcome } from '@/services/types';

/**
 * Holds the saga state for one *logical* checkout attempt against a given cart:
 *  - `key`: a single Idempotency-Key reused across retries, so a retried
 *    checkout replays the same order instead of creating a duplicate.
 *  - `order`: the order created by step 1, so a retry after a *confirm* failure
 *    skips checkout entirely and just re-confirms by order_id.
 * Reset on terminal success (next attempt is fresh) or when the cart changes.
 */
interface CheckoutAttempt {
  cartId: string;
  key: string | null;
  order: CheckoutResponse | null;
}

/**
 * Mock pay flow: POST /checkout with a simulated outcome, then call the
 * mock-only confirm endpoint (stands in for the Payment Element submit + the
 * async Stripe webhook). Returns the order so the caller can route to the
 * result page, which then polls the order status (SPEC §7).
 *
 * Idempotency (mirrors the backend checkout saga, B1/B2): one Idempotency-Key
 * per logical attempt, held in a ref and reused across retries. The two steps
 * are decoupled — checkout (create/replay the order, idempotent on the key) and
 * confirm (retriable by order_id) — so a transient confirm failure never
 * creates a second order on retry.
 */
export function useMockPay(cartId: string) {
  const queryClient = useQueryClient();
  const attemptRef = useRef<CheckoutAttempt>({ cartId, key: null, order: null });

  // A new cart is a new logical attempt — drop any carried-over key/order.
  if (attemptRef.current.cartId !== cartId) {
    attemptRef.current = { cartId, key: null, order: null };
  }

  return useMutation<CheckoutResponse, unknown, MockPaymentOutcome>({
    mutationFn: async (outcome) => {
      const attempt = attemptRef.current;
      if (!attempt.key) attempt.key = crypto.randomUUID();

      // Step 1 — create (or replay) the order. Skipped on a confirm-retry: if we
      // already hold an order from this attempt, reuse it instead of checking
      // out again. Even if we did call again, the key makes it idempotent.
      let order = attempt.order;
      if (!order) {
        order = await checkout(cartId, { idempotencyKey: attempt.key, mockOutcome: outcome });
        attempt.order = order;
      }

      // Step 2 — confirm payment, keyed by order_id. Independently retriable: a
      // failure here leaves attempt.order set, so the next retry re-confirms the
      // same order rather than creating a new one.
      await confirmMockPayment(order.order_id);
      return order;
    },
    onSuccess: () => {
      // Terminal success: clear saga state so the next checkout is a fresh
      // attempt. The confirm consumed the server cart — refetch so the badge
      // resets — and refresh the orders list to include the new order.
      attemptRef.current = { cartId, key: null, order: null };
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => {
      // The failure may reflect server-side stock changes (out_of_stock), so the
      // cached cart's `available` is now stale — refetch it so the same failure
      // doesn't keep re-triggering against phantom availability. The
      // Idempotency-Key/order are deliberately *kept* so a retry is idempotent.
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
    },
  });
}

/** Live: create the PaymentIntent and return its client_secret for Stripe Elements. */
export function useCreatePaymentIntent(cartId: string) {
  // One key per logical attempt here too (held across retries), so re-submitting
  // the Payment Element replays the same PaymentIntent rather than minting a new
  // order each time (§9.1).
  const keyRef = useRef<{ cartId: string; key: string | null }>({ cartId, key: null });
  if (keyRef.current.cartId !== cartId) keyRef.current = { cartId, key: null };

  return useMutation<CheckoutResponse, unknown, void>({
    mutationFn: () => {
      if (!keyRef.current.key) keyRef.current.key = crypto.randomUUID();
      return checkout(cartId, { idempotencyKey: keyRef.current.key });
    },
  });
}
