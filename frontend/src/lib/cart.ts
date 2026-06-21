import type { Cart, CartItem } from '@/services/types';

/**
 * Pure optimistic-update helpers for the cart cache. Kept side-effect free so
 * they can be unit tested and reused by the TanStack Query mutation hooks.
 *
 * Lines are merged by `variant_id` (the only stable client-side identity); the
 * server assigns the authoritative opaque `id`. The optimistic `id` below is a
 * CLIENT-ONLY placeholder — it must never be assumed to match the backend's id,
 * and is replaced wholesale when the server's cart reconciles the cache.
 */

/** Client-only placeholder id for an optimistic line, replaced by the server. */
function optimisticItemId(variantId: string): string {
  return `ci_${variantId}`;
}

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

/**
 * Clamp a line quantity to what's actually purchasable. When `available` is 0
 * the line is genuinely out of stock — return 0 rather than masking it as 1; the
 * server cart is authoritative and a 0 here lets the UI disable/drop the line
 * instead of advertising phantom stock.
 */
function clampQty(qty: number, available: number): number {
  if (available <= 0) return 0;
  return Math.max(1, Math.min(qty, available));
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
  // Merge by variant_id — the stable client identity — never by reconstructing
  // the server's opaque line id.
  const existing = base.items.find((item) => item.variant_id === preview.variant_id);

  if (existing) {
    const nextQty = clampQty(existing.qty + qty, existing.available);
    return recompute(
      base,
      base.items.map((item) =>
        item.variant_id === preview.variant_id
          ? { ...item, qty: nextQty, line_total_cents: item.unit_price_cents * nextQty }
          : item,
      ),
    );
  }

  const nextQty = clampQty(qty, preview.available);
  const item: CartItem = {
    id: optimisticItemId(preview.variant_id),
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
