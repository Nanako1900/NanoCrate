import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/services/query-client';
import { __resetMockStore } from '@/mocks/store';
import { addCartItem, checkout, confirmMockPayment, getOrder } from '@/services/api';
import { CheckoutResultPage } from './CheckoutResultPage';

beforeEach(() => {
  __resetMockStore();
});

function renderResult(orderId: string) {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/checkout/result?order_id=${orderId}`]}>
        <CheckoutResultPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Drive the oversell race so a real `cancelled` order exists to render. */
async function makeCancelledOrder(): Promise<string> {
  const cart = await addCartItem({ variant_id: 'v_nano75_red', qty: 12 });
  const a = await checkout(cart.id, { idempotencyKey: 'a', mockOutcome: 'succeeded' });
  const b = await checkout(cart.id, { idempotencyKey: 'b', mockOutcome: 'succeeded' });
  await confirmMockPayment(a.order_id);
  await confirmMockPayment(b.order_id).catch(() => {}); // out_of_stock → b cancelled
  await waitFor(async () => expect((await getOrder(b.order_id)).status).toBe('cancelled'));
  return b.order_id;
}

describe('CheckoutResultPage (F4/F7)', () => {
  it('renders a distinct cancelled view (not a failed payment) and moves focus to the heading', async () => {
    const cancelledId = await makeCancelledOrder();
    renderResult(cancelledId);

    const heading = await screen.findByRole('heading', { name: 'Order cancelled' });
    // F4: it must NOT be treated as a failed payment.
    expect(screen.queryByRole('heading', { name: /go through/i })).toBeNull();
    // Distinct affordance: a link straight to the order detail.
    expect(screen.getByRole('link', { name: 'View order' })).toHaveAttribute(
      'href',
      `/orders/${cancelledId}`,
    );
    // F7: focus lands on the result heading at the terminal state.
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('renders the paid view and focuses its heading', async () => {
    const cart = await addCartItem({ variant_id: 'v_nano75_red', qty: 1 });
    const { order_id } = await checkout(cart.id, { mockOutcome: 'succeeded' });
    await confirmMockPayment(order_id);

    renderResult(order_id);
    const heading = await screen.findByRole('heading', { name: 'Payment confirmed' });
    await waitFor(() => expect(heading).toHaveFocus());
  });
});
