import { http, HttpResponse, delay } from 'msw';
import type { PaginationMeta, ProductSort } from '@/services/types';
import { mockProductTypes } from './fixtures/product-types';
import { mockProducts, priceFromCents, toDetail, toListItem, type MockProduct } from './fixtures/products';

/**
 * MSW handlers mirroring backend.md §9 (the contract). Keep these in lockstep
 * with §9 — when the contract changes, update here in the same change.
 */

const BASE = '/api/v1';
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
];
