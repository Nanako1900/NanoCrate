import { http, HttpResponse, delay } from 'msw';
import type { PaginationMeta, ProductSort } from '@/services/types';
import { mockProductTypes } from './fixtures/product-types';
import { mockProducts, priceFromCents, toDetail, toListItem, type MockProduct } from './fixtures/products';
import {
  addToCart,
  buildCart,
  confirmMockPayment,
  createOrder,
  getOrderDetail,
  listOrders,
  removeCartItem,
  updateCartItem,
  variantExists,
} from './store';
import { adminHandlers } from './admin/handlers';

/**
 * MSW handlers mirroring backend.md §9 (the contract). Keep these in lockstep
 * with §9 — when the contract changes, update here in the same change.
 *
 * Phase 2 note: the mock simulates the async Stripe webhook. POST /checkout
 * accepts a mock-only `X-Mock-Outcome` header (succeeded|failed|out_of_stock)
 * — ignored by a real backend — and `POST /mock/confirm-payment` is a mock-only
 * endpoint standing in for the user confirming payment + the webhook landing.
 */

const BASE = '/api/v1';
const ORDERS_LIMIT = 20;
const DEFAULT_LIMIT = 9;

// Visible latency in dev so skeletons render; instant under test for speed.
const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 220;

function ok<T>(data: T, meta?: PaginationMeta) {
  return HttpResponse.json({ success: true, data, error: null, ...(meta ? { meta } : {}) });
}

function fail(code: string, message: string, status = 400) {
  return HttpResponse.json({ success: false, data: null, error: { code, message } }, { status });
}

function matchesQuery(product: MockProduct, q: string): boolean {
  if (!q) return true;
  const haystack = [
    product.name,
    product.description,
    product.type,
    ...Object.values(product.attributes).map(String),
    ...product.variants.flatMap((variant) => [variant.name, variant.sku]),
  ]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function sortProducts(products: MockProduct[], sort: ProductSort): MockProduct[] {
  const copy = [...products];
  switch (sort) {
    case 'price_asc':
      return copy.sort((a, b) => priceFromCents(a) - priceFromCents(b));
    case 'price_desc':
      return copy.sort((a, b) => priceFromCents(b) - priceFromCents(a));
    case 'newest':
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function parseSort(value: string | null): ProductSort {
  return value === 'price_asc' || value === 'price_desc' || value === 'newest' ? value : 'newest';
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const handlers = [
  // GET /product-types — category templates (§9.2)
  http.get(`${BASE}/product-types`, async () => {
    await delay(LATENCY_MS);
    return ok(mockProductTypes);
  }),

  // GET /products?type=&q=&page=&limit=&sort= — list / filter (§9.3)
  http.get(`${BASE}/products`, async ({ request }) => {
    await delay(LATENCY_MS);
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const q = url.searchParams.get('q') ?? '';
    const sort = parseSort(url.searchParams.get('sort'));
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const limit = parsePositiveInt(url.searchParams.get('limit'), DEFAULT_LIMIT);

    let filtered = mockProducts;
    if (type) filtered = filtered.filter((product) => product.type === type);
    if (q) filtered = filtered.filter((product) => matchesQuery(product, q));
    const sorted = sortProducts(filtered, sort);

    const total = sorted.length;
    const start = (page - 1) * limit;
    const pageItems = sorted.slice(start, start + limit).map(toListItem);

    return ok(pageItems, { total, page, limit });
  }),

  // GET /products/:slug — detail + variants + availability (§9.3)
  http.get(`${BASE}/products/:slug`, async ({ params }) => {
    await delay(LATENCY_MS);
    const slug = String(params.slug);
    const product = mockProducts.find((candidate) => candidate.slug === slug);
    if (!product) {
      return fail('not_found', `No product found for "${slug}".`, 404);
    }
    return ok(toDetail(product));
  }),

  // POST /search — semantic + keyword hybrid search (stub) (§9.3)
  http.post(`${BASE}/search`, async ({ request }) => {
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as { query?: string; limit?: number } | null;
    const query = (body?.query ?? '').trim();
    const limit = parsePositiveInt(String(body?.limit ?? ''), 10);

    if (!query) {
      return fail('validation_failed', 'A non-empty "query" is required.', 422);
    }

    // Stub ranking: keyword overlap, with a deterministic fallback ordering so
    // even a fuzzy natural-language query returns a stable, demoable result set.
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const ranked = mockProducts
      .map((product, index) => {
        const haystack = [product.name, product.description, ...Object.values(product.attributes).map(String)]
          .join(' ')
          .toLowerCase();
        const overlap = tokens.reduce((acc, token) => (haystack.includes(token) ? acc + 1 : acc), 0);
        const keywordScore = tokens.length ? overlap / tokens.length : 0;
        const score = Number((keywordScore * 0.7 + (1 - index / mockProducts.length) * 0.3).toFixed(2));
        return { slug: product.slug, name: product.name, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return ok({ hits: ranked });
  }),

  /* ---- Cart (§9.4). Every mutation returns the whole latest cart. ---- */

  http.get(`${BASE}/cart`, async () => {
    await delay(LATENCY_MS);
    return ok(buildCart());
  }),

  http.post(`${BASE}/cart/items`, async ({ request }) => {
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as { variant_id?: string; qty?: number } | null;
    const variantId = body?.variant_id ?? '';
    const qty = parsePositiveInt(String(body?.qty ?? ''), 1);
    if (!variantId || !variantExists(variantId)) {
      return fail('validation_failed', 'A valid variant_id is required.', 422);
    }
    return ok(addToCart(variantId, qty));
  }),

  http.patch(`${BASE}/cart/items/:id`, async ({ params, request }) => {
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as { qty?: number } | null;
    const qty = Number(body?.qty);
    if (!Number.isInteger(qty)) {
      return fail('validation_failed', 'A numeric "qty" is required.', 422);
    }
    const cart = updateCartItem(String(params.id), qty);
    if (!cart) return fail('not_found', 'Cart item not found.', 404);
    return ok(cart);
  }),

  http.delete(`${BASE}/cart/items/:id`, async ({ params }) => {
    await delay(LATENCY_MS);
    const cart = removeCartItem(String(params.id));
    if (!cart) return fail('not_found', 'Cart item not found.', 404);
    return ok(cart);
  }),

  /* ---- Checkout (§9.3). Mock-only X-Mock-Outcome drives the simulation. ---- */

  http.post(`${BASE}/checkout`, async ({ request }) => {
    await delay(LATENCY_MS);
    const outcomeHeader = request.headers.get('X-Mock-Outcome');
    if (outcomeHeader === 'out_of_stock') {
      return fail('out_of_stock', 'Reserved stock is unavailable. Adjust your cart and try again.', 409);
    }
    const terminal = outcomeHeader === 'failed' ? 'failed' : 'succeeded';
    const idempotencyKey = request.headers.get('Idempotency-Key');
    const result = createOrder(idempotencyKey, terminal);
    if (!result) {
      return fail('validation_failed', 'Your cart is empty.', 422);
    }
    return ok(result);
  }),

  // MOCK-ONLY: stands in for confirming payment + the Stripe webhook landing.
  http.post(`${BASE}/mock/confirm-payment`, async ({ request }) => {
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as { order_id?: string } | null;
    const result = body?.order_id ? confirmMockPayment(body.order_id) : 'not_found';
    if (result === 'not_found') return fail('not_found', 'Order not found.', 404);
    if (result === 'out_of_stock') {
      // Stock ran out before settlement — the order is compensated to cancelled.
      return fail('out_of_stock', 'Reserved stock is unavailable. Adjust your cart and try again.', 409);
    }
    return ok({ status: 'processing' });
  }),

  /* ---- Orders (§9.4) ---- */

  http.get(`${BASE}/orders`, async ({ request }) => {
    await delay(LATENCY_MS);
    const url = new URL(request.url);
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const limit = parsePositiveInt(url.searchParams.get('limit'), ORDERS_LIMIT);
    const all = listOrders();
    const start = (page - 1) * limit;
    return ok(all.slice(start, start + limit), { total: all.length, page, limit });
  }),

  http.get(`${BASE}/orders/:id`, async ({ params }) => {
    await delay(LATENCY_MS);
    const order = getOrderDetail(String(params.id));
    if (!order) return fail('not_found', `No order found for "${String(params.id)}".`, 404);
    return ok(order);
  }),

  // Admin surface (proposed §9.5) — RBAC-gated inside each handler.
  ...adminHandlers,
];
