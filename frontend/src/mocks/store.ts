import type {
  Cart,
  CartItem,
  OrderDetail,
  OrderItem,
  OrderStatus,
  OrderSummary,
  PaymentStatus,
} from '@/services/types';
import { mockProducts } from './fixtures/products';

/**
 * In-memory mock backend state for Phase 2 (cart + orders). Persists for the
 * lifetime of the page/worker; a reload resets it — acceptable for a mock.
 * The MSW handlers are the only callers. State updates are done immutably.
 */

const CART_ID = 'cart_mock_01';
const CURRENCY = 'USD';

/** Settlement delay simulates the async Stripe webhook the result page polls for. */
const SETTLE_MS = import.meta.env.MODE === 'test' ? 0 : 700;

export type MockOutcome = 'succeeded' | 'failed' | 'out_of_stock';

interface VariantRef {
  productName: string;
  sku: string;
  name: string;
  price_cents: number;
  available: number;
}

const variantIndex: Map<string, VariantRef> = (() => {
  const index = new Map<string, VariantRef>();
  for (const product of mockProducts) {
    for (const variant of product.variants) {
      index.set(variant.id, {
        productName: product.name,
        sku: variant.sku,
        name: variant.name,
        price_cents: variant.price_cents,
        available: variant.available,
      });
    }
  }
  return index;
})();

interface CartLine {
  variantId: string;
  qty: number;
}

let cartLines: CartLine[] = [];

function cartItemId(variantId: string): string {
  return `ci_${variantId}`;
}

function variantIdFromItemId(itemId: string): string {
  return itemId.replace(/^ci_/, '');
}

function toCartItem(line: CartLine): CartItem | null {
  const ref = variantIndex.get(line.variantId);
  if (!ref) return null;
  return {
    id: cartItemId(line.variantId),
    variant_id: line.variantId,
    sku: ref.sku,
    name: `${ref.productName} · ${ref.name}`,
    unit_price_cents: ref.price_cents,
    qty: line.qty,
    line_total_cents: ref.price_cents * line.qty,
    available: ref.available,
  };
}

export function buildCart(): Cart {
  const items = cartLines
    .map(toCartItem)
    .filter((item): item is CartItem => item !== null);
  return {
    id: CART_ID,
    currency: CURRENCY,
    item_count: items.reduce((sum, item) => sum + item.qty, 0),
    subtotal_cents: items.reduce((sum, item) => sum + item.line_total_cents, 0),
    items,
  };
}

export function variantExists(variantId: string): boolean {
  return variantIndex.has(variantId);
}

function clamp(qty: number, max: number): number {
  return Math.max(1, Math.min(qty, Math.max(1, max)));
}

export function addToCart(variantId: string, qty: number): Cart {
  const ref = variantIndex.get(variantId);
  if (!ref) return buildCart();
  const existing = cartLines.find((line) => line.variantId === variantId);
  if (existing) {
    cartLines = cartLines.map((line) =>
      line.variantId === variantId ? { ...line, qty: clamp(line.qty + qty, ref.available) } : line,
    );
  } else {
    cartLines = [...cartLines, { variantId, qty: clamp(qty, ref.available) }];
  }
  return buildCart();
}

export function updateCartItem(itemId: string, qty: number): Cart | null {
  const variantId = variantIdFromItemId(itemId);
  const ref = variantIndex.get(variantId);
  if (!cartLines.some((line) => line.variantId === variantId)) return null;
  if (qty <= 0) {
    cartLines = cartLines.filter((line) => line.variantId !== variantId);
  } else {
    cartLines = cartLines.map((line) =>
      line.variantId === variantId ? { ...line, qty: clamp(qty, ref?.available ?? qty) } : line,
    );
  }
  return buildCart();
}

export function removeCartItem(itemId: string): Cart | null {
  const variantId = variantIdFromItemId(itemId);
  if (!cartLines.some((line) => line.variantId === variantId)) return null;
  cartLines = cartLines.filter((line) => line.variantId !== variantId);
  return buildCart();
}

export function clearCart(): void {
  cartLines = [];
}

/* ---- Orders ---- */

interface OrderRecord {
  id: string;
  items: OrderItem[];
  subtotal_cents: number;
  total_cents: number;
  createdAt: string;
  outcome: Exclude<MockOutcome, 'out_of_stock'>;
  settleAt: number | null; // when the simulated webhook lands; null until "paid" attempt
}

const orders: Map<string, OrderRecord> = new Map();
const ordersByIdempotency: Map<string, string> = new Map();
let orderSeq = 1;

function nowMs(): number {
  return Date.now();
}

function currentState(record: OrderRecord): { status: OrderStatus; payment: PaymentStatus } {
  if (record.settleAt === null || nowMs() < record.settleAt) {
    return { status: 'pending', payment: 'requires_payment' };
  }
  return record.outcome === 'succeeded'
    ? { status: 'paid', payment: 'succeeded' }
    : { status: 'failed', payment: 'failed' };
}

export interface CheckoutResult {
  order_id: string;
  client_secret: string;
}

/**
 * Create an order from the current cart. Idempotent on idempotencyKey.
 * `outcome` is the mock-only desired terminal payment result (succeeded|failed).
 */
export function createOrder(
  idempotencyKey: string | null,
  outcome: Exclude<MockOutcome, 'out_of_stock'>,
): CheckoutResult | null {
  if (idempotencyKey) {
    const existingId = ordersByIdempotency.get(idempotencyKey);
    if (existingId) {
      return { order_id: existingId, client_secret: `pi_mock_${existingId}_secret_mock` };
    }
  }

  const cart = buildCart();
  if (cart.items.length === 0) return null;

  const id = `o_${String(orderSeq++).padStart(2, '0')}`;
  const items: OrderItem[] = cart.items.map((item) => ({
    sku: item.sku,
    name: item.name,
    unit_price_cents: item.unit_price_cents,
    qty: item.qty,
    line_total_cents: item.line_total_cents,
  }));

  orders.set(id, {
    id,
    items,
    subtotal_cents: cart.subtotal_cents,
    total_cents: cart.subtotal_cents,
    createdAt: new Date().toISOString(),
    outcome,
    settleAt: null,
  });
  if (idempotencyKey) ordersByIdempotency.set(idempotencyKey, id);

  return { order_id: id, client_secret: `pi_mock_${id}_secret_mock` };
}

/** Simulate the user confirming payment → schedules the async webhook result. */
export function confirmMockPayment(orderId: string): boolean {
  const record = orders.get(orderId);
  if (!record) return false;
  orders.set(orderId, { ...record, settleAt: nowMs() + SETTLE_MS });
  if (record.outcome === 'succeeded') clearCart();
  return true;
}

export function getOrderDetail(orderId: string): OrderDetail | null {
  const record = orders.get(orderId);
  if (!record) return null;
  const { status, payment } = currentState(record);
  return {
    id: record.id,
    status,
    currency: CURRENCY,
    subtotal_cents: record.subtotal_cents,
    total_cents: record.total_cents,
    payment: { provider: 'stripe', status: payment },
    items: record.items,
    created_at: record.createdAt,
  };
}

export function listOrders(): OrderSummary[] {
  return [...orders.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((record) => ({
      id: record.id,
      status: currentState(record).status,
      total_cents: record.total_cents,
      currency: CURRENCY,
      item_count: record.items.reduce((sum, item) => sum + item.qty, 0),
      created_at: record.createdAt,
    }));
}

/** Test-only: reset all mutable mock state so cases stay isolated. */
export function __resetMockStore(): void {
  cartLines = [];
  orders.clear();
  ordersByIdempotency.clear();
  orderSeq = 1;
}
