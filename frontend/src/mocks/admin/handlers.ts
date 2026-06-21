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
 * MSW handlers for the admin surface, aligned to backend.md §9.5. Every route is
 * gated by requireAdmin (401 without a token, 403 without the admin role, per
 * §10). Write endpoints validate `attributes` against the type's
 * attribute_schema and report validation_failed with error.details[].
 */

const ADMIN_PRODUCTS_LIMIT = 12;
const ADMIN_ORDERS_LIMIT = 20;
const INVENTORY_LIMIT = 20;
const LEDGER_LIMIT = 50;

function adminProductTypes() {
  return Object.entries(ADMIN_ATTRIBUTE_SCHEMAS).map(([key, attribute_schema]) => {
    const base = mockProductTypes.find((t) => t.key === key);
    return { key, name: base?.name ?? key, product_count: base?.product_count, attribute_schema };
  });
}

export const adminHandlers = [
  http.get(`${BASE}/admin/dashboard`, async ({ request }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    return ok(getDashboard());
  }),

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
    return found ? ok(found) : fail('not_found', `unknown product type "${String(params.key)}"`, 404);
  }),

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

  // GET /admin/products/:id (detail+variants) — not yet in §9.5; flagged.
  http.get(`${BASE}/admin/products/:id`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const detail = getProductDetail(String(params.id));
    return detail ? ok(detail) : fail('not_found', 'product not found', 404);
  }),

  http.post(`${BASE}/admin/products`, async ({ request }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const name = String(body?.name ?? '').trim();
    const type = String(body?.type ?? '');
    if (!name) return fail('validation_failed', 'attribute validation failed', 422, [{ field: 'name', message: 'name is required' }]);
    const attributes = (body?.attributes as Record<string, string | number | boolean>) ?? {};
    const details = validateAttributes(type, attributes);
    if (details.length) return fail('validation_failed', 'attribute validation failed', 422, details);
    return ok(
      createProduct({
        name,
        slug: body?.slug ? String(body.slug) : undefined,
        type,
        description: String(body?.description ?? ''),
        status: (body?.status as 'active' | 'draft' | 'archived') ?? 'draft',
        attributes,
      }),
    );
  }),

  http.patch(`${BASE}/admin/products/:id`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const existing = getProductDetail(String(params.id));
    if (!existing) return fail('not_found', 'product not found', 404);
    const type = String(body?.type ?? existing.type);
    if (body?.attributes) {
      const details = validateAttributes(type, body.attributes as Record<string, unknown>);
      if (details.length) return fail('validation_failed', 'attribute validation failed', 422, details);
    }
    const updated = updateProduct(String(params.id), {
      name: body?.name as string | undefined,
      slug: body?.slug as string | undefined,
      description: body?.description as string | undefined,
      type: body?.type as string | undefined,
      status: body?.status as 'active' | 'draft' | 'archived' | undefined,
      attributes: body?.attributes as Record<string, string | number | boolean> | undefined,
    });
    return updated ? ok(updated) : fail('not_found', 'product not found', 404);
  }),

  http.delete(`${BASE}/admin/products/:id`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const archived = archiveProduct(String(params.id));
    return archived ? ok(archived) : fail('not_found', 'product not found', 404);
  }),

  // §9.5: variant write endpoints return the variant.
  http.post(`${BASE}/admin/products/:id/variants`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const sku = String(body?.sku ?? '').trim();
    if (!sku) return fail('validation_failed', 'attribute validation failed', 422, [{ field: 'sku', message: 'sku is required' }]);
    if (skuExists(sku)) return fail('conflict', `sku "${sku}" already exists`, 409);
    const price = Number(body?.price_cents);
    if (!Number.isFinite(price) || price < 0) return fail('validation_failed', 'attribute validation failed', 422, [{ field: 'price_cents', message: 'a valid price is required' }]);
    const created = createVariant(String(params.id), {
      sku,
      name: String(body?.name ?? sku),
      price_cents: Math.round(price),
      status: body?.status as 'active' | 'draft' | 'archived' | undefined,
      attributes: (body?.attributes as Record<string, string | number | boolean>) ?? {},
      available: Math.max(0, Number(body?.available ?? 0)),
    });
    return created ? ok(created) : fail('not_found', 'product not found', 404);
  }),

  http.patch(`${BASE}/admin/variants/:id`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const id = String(params.id);
    if (typeof body?.sku === 'string' && skuExists(body.sku, id)) return fail('conflict', `sku "${body.sku}" already exists`, 409);
    const updated = updateVariant(id, {
      sku: body?.sku as string | undefined,
      name: body?.name as string | undefined,
      price_cents: body?.price_cents !== undefined ? Math.round(Number(body.price_cents)) : undefined,
      status: body?.status as 'active' | 'draft' | 'archived' | undefined,
      attributes: body?.attributes as Record<string, string | number | boolean> | undefined,
      available: body?.available !== undefined ? Math.max(0, Number(body.available)) : undefined,
    });
    return updated ? ok(updated) : fail('not_found', 'variant not found', 404);
  }),

  http.get(`${BASE}/admin/inventory`, async ({ request }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const url = new URL(request.url);
    const low = url.searchParams.get('low') === 'true';
    const threshold = parsePositiveInt(url.searchParams.get('threshold'), 5);
    const rows = listInventory(low, threshold);
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const limit = parsePositiveInt(url.searchParams.get('limit'), INVENTORY_LIMIT);
    const { slice, meta } = paginate(rows, page, limit);
    return ok(slice, meta);
  }),

  http.get(`${BASE}/admin/inventory/:variantId/ledger`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const entries = getLedger(String(params.variantId));
    if (!entries) return fail('not_found', 'variant not found', 404);
    const url = new URL(request.url);
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const limit = parsePositiveInt(url.searchParams.get('limit'), LEDGER_LIMIT);
    const { slice, meta } = paginate(entries, page, limit);
    return ok(slice, meta);
  }),

  http.post(`${BASE}/admin/inventory/:variantId/restock`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const body = (await request.json().catch(() => null)) as { qty?: number } | null;
    const qty = Number(body?.qty);
    if (!Number.isInteger(qty) || qty <= 0) return fail('validation_failed', 'attribute validation failed', 422, [{ field: 'qty', message: 'qty must be a positive integer' }]);
    const row = restock(String(params.variantId), qty);
    return row ? ok(row) : fail('not_found', 'variant not found', 404);
  }),

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

  http.get(`${BASE}/admin/orders/:id`, async ({ request, params }) => {
    const gate = requireAdmin(request);
    if (gate) return gate;
    await delay(LATENCY_MS);
    const detail = getOrderDetail(String(params.id));
    return detail ? ok(detail) : fail('not_found', 'order not found', 404);
  }),
];
