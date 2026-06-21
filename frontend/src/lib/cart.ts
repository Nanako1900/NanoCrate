import type { Cart, CartItem } from '@/services/types';

/**
 * Pure optimistic-update helpers for the cart cache. Kept side-effect free so
 * they can be unit tested and reused by the TanStack Query mutation hooks.
 * Item ids follow the mock/backend scheme `ci_<variantId>` so an optimistic
 * line merges seamlessly when the server's authoritative cart replaces it.
 */

export interface CartItemPreview {
  variant_id: string;
  sku: string;
  name: string;
  unit_price_cents: number;
  available: number;
}

const EMPTY_CART: Cart = {
  id: 'cart_pending',
  currency: 'USD',
  item_count: 0,
  subtotal_cents: 0,
  items: [],
};

function clampQty(qty: number, available: number): number {
  return Math.max(1, Math.min(qty, Math.max(1, available)));
}

function recompute(base: Cart, items: CartItem[]): Cart {
  return {
    ...base,
    items,
    item_count: items.reduce((sum, item) => sum + item.qty, 0),
    subtotal_cents: items.reduce((sum, item) => sum + item.line_total_cents, 0),
  };
}

export function optimisticAdd(cart: Cart | undefined, preview: CartItemPreview, qty: number): Cart {
  const base = cart ?? EMPTY_CART;
  const id = `ci_${preview.variant_id}`;
  const existing = base.items.find((item) => item.id === id);

  if (existing) {
    const nextQty = clampQty(existing.qty + qty, existing.available);
    return recompute(
      base,
      base.items.map((item) =>
        item.id === id
          ? { ...item, qty: nextQty, line_total_cents: item.unit_price_cents * nextQty }
          : item,
      ),
    );
  }

  const nextQty = clampQty(qty, preview.available);
  const item: CartItem = {
    id,
    variant_id: preview.variant_id,
    sku: preview.sku,
    name: preview.name,
    unit_price_cents: preview.unit_price_cents,
    qty: nextQty,
    line_total_cents: preview.unit_price_cents * nextQty,
    available: preview.available,
  };
  return recompute(base, [...base.items, item]);
}

export function optimisticUpdate(cart: Cart | undefined, itemId: string, qty: number): Cart {
  const base = cart ?? EMPTY_CART;
  if (qty <= 0) {
    return recompute(base, base.items.filter((item) => item.id !== itemId));
  }
  return recompute(
    base,
    base.items.map((item) => {
      if (item.id !== itemId) return item;
      const nextQty = clampQty(qty, item.available);
      return { ...item, qty: nextQty, line_total_cents: item.unit_price_cents * nextQty };
    }),
  );
}

export function optimisticRemove(cart: Cart | undefined, itemId: string): Cart {
  const base = cart ?? EMPTY_CART;
  return recompute(base, base.items.filter((item) => item.id !== itemId));
}
