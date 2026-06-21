import { http, delay } from 'msw';
import { BASE, LATENCY_MS, fail, ok, paginate, parsePositiveInt, requireAdmin } from '../respond';
import { mockProductTypes } from '../fixtures/product-types';
import { ADMIN_ATTRIBUTE_SCHEMAS } from './schemas';
import {
  archiveProduct,
  createProduct,
  createVariant,
  getDashboard,
  getLedger,
  getOrderDetail,
  getProductDetail,
  listInventory,
  listOrders,
  listProducts,
  restock,
  skuExists,
  updateProduct,
  updateVariant,
  validateAttributes,
} from './store';

/**
 * MSW handlers for the admin surface (PROPOSED §9.5). Every route is gated by
 * requireAdmin (401 without a token, 403 without the admin role) — mirroring
 * auth.RequireRole("admin") (backend.md §10). Reconcile shapes with §9.5 when
 * the backend lands it.
 */

const ADMIN_PRODUCTS_LIMIT = 12;
const ADMIN_ORDERS_LIMIT = 20;

function adminProductTypes() {
  return Object.entries(ADMIN_ATTRIBUTE_SCHEMAS).map(([key, attribute_schema]) => {
    const base = mockProductTypes.find((t) => t.key === key);
    return { key, name: base?.name ?? key, product_count: base?.product_count, attribute_schema };
  });
}

export const adminHandlers = [
  // GET /admin/dashboard
  http.get(`${BASE}/admin/dashboard`, async ({ request }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    return ok(getDashboard());
  }),

  // GET /admin/product-types  +  /:key (attribute_schema → dynamic form)
  http.get(`${BASE}/admin/product-types`, async ({ request }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    return ok(adminProductTypes());
  }),
  http.get(`${BASE}/admin/product-types/:key`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const found = adminProductTypes().find((t) => t.key === String(params.key));
    return found ? ok(found) : fail('not_found', `Unknown product type "${String(params.key)}".`, 404);
  }),

  // GET /admin/products  (filter/sort/paginate)
  http.get(`${BASE}/admin/products`, async ({ request }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const url = new URL(request.url);
    const items = listProducts({
      q: url.searchParams.get('q') ?? undefined,
      type: url.searchParams.get('type') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      sort: url.searchParams.get('sort') ?? undefined,
    });
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const limit = parsePositiveInt(url.searchParams.get('limit'), ADMIN_PRODUCTS_LIMIT);
    const { slice, meta } = paginate(items, page, limit);
    return ok(slice, meta);
  }),

  // GET /admin/products/:id
  http.get(`${BASE}/admin/products/:id`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const detail = getProductDetail(String(params.id));
    return detail ? ok(detail) : fail('not_found', 'Product not found.', 404);
  }),

  // POST /admin/products
  http.post(`${BASE}/admin/products`, async ({ request }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const name = String(body?.name ?? '').trim();
    const type = String(body?.type ?? '');
    if (!name) return fail('validation_failed', 'Product name is required.', 422);
    const attributes = (body?.attributes as Record<string, string | number | boolean>) ?? {};
    const invalid = validateAttributes(type, attributes);
    if (invalid) return fail('validation_failed', invalid.message, 422);
    return ok(
      createProduct({
        name,
        type,
        description: String(body?.description ?? ''),
        status: (body?.status as 'active' | 'draft' | 'archived') ?? 'draft',
        attributes,
      }),
    );
  }),

  // PATCH /admin/products/:id
  http.patch(`${BASE}/admin/products/:id`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const existing = getProductDetail(String(params.id));
    if (!existing) return fail('not_found', 'Product not found.', 404);
    const type = String(body?.type ?? existing.type);
    if (body?.attributes) {
      const invalid = validateAttributes(type, body.attributes as Record<string, unknown>);
      if (invalid) return fail('validation_failed', invalid.message, 422);
    }
    const updated = updateProduct(String(params.id), {
      name: body?.name as string | undefined,
      description: body?.description as string | undefined,
      type: body?.type as string | undefined,
      status: body?.status as 'active' | 'draft' | 'archived' | undefined,
      attributes: body?.attributes as Record<string, string | number | boolean> | undefined,
    });
    return updated ? ok(updated) : fail('not_found', 'Product not found.', 404);
  }),

  // DELETE /admin/products/:id  (archive)
  http.delete(`${BASE}/admin/products/:id`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const archived = archiveProduct(String(params.id));
    return archived ? ok(archived) : fail('not_found', 'Product not found.', 404);
  }),

  // POST /admin/products/:id/variants
  http.post(`${BASE}/admin/products/:id/variants`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const sku = String(body?.sku ?? '').trim();
    if (!sku) return fail('validation_failed', 'SKU is required.', 422);
    if (skuExists(sku)) return fail('conflict', `SKU "${sku}" already exists.`, 409);
    const price = Number(body?.price_cents);
    if (!Number.isFinite(price) || price < 0) return fail('validation_failed', 'A valid price is required.', 422);
    const created = createVariant(String(params.id), {
      sku,
      name: String(body?.name ?? sku),
      price_cents: Math.round(price),
      attributes: (body?.attributes as Record<string, string | number | boolean>) ?? {},
      available: Math.max(0, Number(body?.available ?? 0)),
    });
    return created ? ok(created) : fail('not_found', 'Product not found.', 404);
  }),

  // PATCH /admin/variants/:id
  http.patch(`${BASE}/admin/variants/:id`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const id = String(params.id);
    if (typeof body?.sku === 'string' && skuExists(body.sku, id))
      return fail('conflict', `SKU "${body.sku}" already exists.`, 409);
    const updated = updateVariant(id, {
      sku: body?.sku as string | undefined,
      name: body?.name as string | undefined,
      price_cents: body?.price_cents !== undefined ? Math.round(Number(body.price_cents)) : undefined,
      attributes: body?.attributes as Record<string, string | number | boolean> | undefined,
      available: body?.available !== undefined ? Math.max(0, Number(body.available)) : undefined,
    });
    return updated ? ok(updated) : fail('not_found', 'Variant not found.', 404);
  }),

  // GET /admin/inventory (?low=1)
  http.get(`${BASE}/admin/inventory`, async ({ request }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const url = new URL(request.url);
    return ok(listInventory(url.searchParams.get('low') === '1'));
  }),

  // GET /admin/inventory/:variant_id/ledger
  http.get(`${BASE}/admin/inventory/:variantId/ledger`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const entries = getLedger(String(params.variantId));
    return entries ? ok(entries) : fail('not_found', 'Variant not found.', 404);
  }),

  // POST /admin/inventory/:variant_id/restock  {qty}
  http.post(`${BASE}/admin/inventory/:variantId/restock`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as { qty?: number } | null;
    const qty = Number(body?.qty);
    if (!Number.isInteger(qty) || qty <= 0) return fail('validation_failed', 'Restock quantity must be a positive integer.', 422);
    const row = restock(String(params.variantId), qty);
    return row ? ok(row) : fail('not_found', 'Variant not found.', 404);
  }),

  // GET /admin/orders (?status, paginate)
  http.get(`${BASE}/admin/orders`, async ({ request }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const url = new URL(request.url);
    const list = listOrders(url.searchParams.get('status') ?? undefined);
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const limit = parsePositiveInt(url.searchParams.get('limit'), ADMIN_ORDERS_LIMIT);
    const { slice, meta } = paginate(list, page, limit);
    return ok(slice, meta);
  }),

  // GET /admin/orders/:id
  http.get(`${BASE}/admin/orders/:id`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const detail = getOrderDetail(String(params.id));
    return detail ? ok(detail) : fail('not_found', 'Order not found.', 404);
  }),
];
