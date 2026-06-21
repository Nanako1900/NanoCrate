import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCartItem,
  checkout,
  confirmMockPayment,
  getCart,
  getOrder,
  getOrders,
  removeCartItem,
  updateCartItem,
} from './api';
import { __resetMockStore } from '@/mocks/store';

/**
 * Integration test for the Phase 2 mock backend: exercises cart mutations and
 * the full checkout → confirm → order lifecycle against the MSW handlers + store
 * (settlement is instant in test mode). Covers success, payment failure, and
 * out-of-stock — the three contract outcomes.
 */
beforeEach(() => {
  __resetMockStore();
});

describe('cart', () => {
  it('adds, updates, and removes items, always returning the latest cart', async () => {
    let cart = await addCartItem({ variant_id: 'v_nano75_red', qty: 2 });
    expect(cart.item_count).toBe(2);
    expect(cart.items[0].sku).toBe('NANO75-RED-PBTW');
    expect(cart.subtotal_cents).toBe(2 * 12900);

    cart = await updateCartItem(cart.items[0].id, 3);
    expect(cart.item_count).toBe(3);
    expect(cart.subtotal_cents).toBe(3 * 12900);

    cart = await removeCartItem(cart.items[0].id);
    expect(cart.items).toHaveLength(0);
    expect(cart.subtotal_cents).toBe(0);
  });

  it('reflects added items via getCart', async () => {
    await addCartItem({ variant_id: 'v_60_red', qty: 1 });
    const cart = await getCart();
    expect(cart.item_count).toBe(1);
  });

  it('rejects an unknown variant with validation_failed', async () => {
    await expect(addCartItem({ variant_id: 'nope', qty: 1 })).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });
});

describe('checkout + orders', () => {
  it('success → order becomes paid and appears in the list', async () => {
    const cart = await addCartItem({ variant_id: 'v_nano75_red', qty: 1 });
    const result = await checkout(cart.id, { mockOutcome: 'succeeded' });
    expect(result.order_id).toMatch(/^o_/);
    expect(result.client_secret).toContain('secret');

    await confirmMockPayment(result.order_id);

    const order = await getOrder(result.order_id);
    expect(order.status).toBe('paid');
    expect(order.payment.status).toBe('succeeded');
    expect(order.items[0].sku).toBe('NANO75-RED-PBTW');

    const list = await getOrders();
    expect(list.orders.some((o) => o.id === result.order_id)).toBe(true);
  });

  it('failure → order becomes failed', async () => {
    const cart = await addCartItem({ variant_id: 'v_nano75_red', qty: 1 });
    const result = await checkout(cart.id, { mockOutcome: 'failed' });
    await confirmMockPayment(result.order_id);

    const order = await getOrder(result.order_id);
    expect(order.status).toBe('failed');
    expect(order.payment.status).toBe('failed');
  });

  it('out_of_stock → checkout rejects with ApiError(out_of_stock)', async () => {
    const cart = await addCartItem({ variant_id: 'v_nano75_red', qty: 1 });
    await expect(checkout(cart.id, { mockOutcome: 'out_of_stock' })).rejects.toMatchObject({
      code: 'out_of_stock',
    });
  });

  it('is idempotent on an empty cart (validation_failed)', async () => {
    const cart = await getCart();
    await expect(checkout(cart.id, { mockOutcome: 'succeeded' })).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });
});
