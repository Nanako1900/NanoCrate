import { describe, expect, it } from 'vitest';
import type { Cart } from '@/services/types';
import { optimisticAdd, optimisticRemove, optimisticUpdate } from './cart';

const base: Cart = {
  id: 'c',
  currency: 'USD',
  item_count: 1,
  subtotal_cents: 1000,
  items: [
    {
      id: 'ci_v1',
      variant_id: 'v1',
      sku: 'SKU1',
      name: 'A',
      unit_price_cents: 1000,
      qty: 1,
      line_total_cents: 1000,
      available: 5,
    },
  ],
};

describe('optimisticAdd', () => {
  it('appends a new line keyed ci_<variant> and recomputes totals', () => {
    const next = optimisticAdd(
      base,
      { variant_id: 'v2', sku: 'SKU2', name: 'B', unit_price_cents: 500, available: 10 },
      2,
    );
    expect(next.items).toHaveLength(2);
    const added = next.items.find((item) => item.id === 'ci_v2');
    expect(added?.qty).toBe(2);
    expect(added?.line_total_cents).toBe(1000);
    expect(next.item_count).toBe(3);
    expect(next.subtotal_cents).toBe(2000);
  });

  it('bumps an existing line, clamped to availability', () => {
    const next = optimisticAdd(
      base,
      { variant_id: 'v1', sku: 'SKU1', name: 'A', unit_price_cents: 1000, available: 5 },
      10,
    );
    expect(next.items[0].qty).toBe(5);
    expect(next.subtotal_cents).toBe(5000);
  });

  it('handles an undefined starting cart', () => {
    const next = optimisticAdd(
      undefined,
      { variant_id: 'v9', sku: 'S', name: 'N', unit_price_cents: 100, available: 3 },
      1,
    );
    expect(next.items).toHaveLength(1);
    expect(next.item_count).toBe(1);
  });

  it('does not mask out-of-stock as qty 1 (F5)', () => {
    // available: 0 → clamp to 0, never floor to 1; the server cart is the truth.
    const next = optimisticAdd(
      undefined,
      { variant_id: 'v0', sku: 'S', name: 'N', unit_price_cents: 100, available: 0 },
      2,
    );
    expect(next.items[0].qty).toBe(0);
    expect(next.items[0].line_total_cents).toBe(0);
    expect(next.subtotal_cents).toBe(0);
  });

  it('merges a repeat add by variant_id even if the server id differs (F14)', () => {
    const serverCart: Cart = {
      ...base,
      items: [{ ...base.items[0], id: 'srv_opaque_999' }], // backend's opaque id
    };
    const next = optimisticAdd(
      serverCart,
      { variant_id: 'v1', sku: 'SKU1', name: 'A', unit_price_cents: 1000, available: 5 },
      2,
    );
    expect(next.items).toHaveLength(1); // merged, not duplicated
    expect(next.items[0].qty).toBe(3);
    expect(next.items[0].id).toBe('srv_opaque_999'); // preserves the server id
  });
});

describe('optimisticUpdate', () => {
  it('updates qty and line total', () => {
    const next = optimisticUpdate(base, 'ci_v1', 3);
    expect(next.items[0].qty).toBe(3);
    expect(next.items[0].line_total_cents).toBe(3000);
    expect(next.subtotal_cents).toBe(3000);
  });

  it('removes the line when qty drops to zero', () => {
    const next = optimisticUpdate(base, 'ci_v1', 0);
    expect(next.items).toHaveLength(0);
    expect(next.item_count).toBe(0);
  });
});

describe('optimisticRemove', () => {
  it('removes the line and zeroes totals', () => {
    const next = optimisticRemove(base, 'ci_v1');
    expect(next.items).toHaveLength(0);
    expect(next.subtotal_cents).toBe(0);
  });
});
