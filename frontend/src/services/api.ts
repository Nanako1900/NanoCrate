import { z } from 'zod';
import { apiBaseUrl } from '@/lib/env';
import { getAuthToken } from './auth-token';
import {
  apiErrorSchema,
  paginationMetaSchema,
  productListSchema,
  productDetailSchema,
  productTypeSchema,
  searchResponseSchema,
  checkoutResponseSchema,
  cartSchema,
  orderListSchema,
  orderDetailSchema,
  type AddCartItemInput,
  type ApiErrorCode,
  type Cart,
  type CheckoutResponse,
  type MockPaymentOutcome,
  type OrderDetail,
  type OrderListResult,
  type PaginationMeta,
  type ProductDetail,
  type ProductListParams,
  type ProductListResult,
  type ProductType,
  type SearchResponse,
} from './types';

/**
 * The ONLY place the app talks to the backend (frontend.md §8). Responsibilities:
 *  - unwrap the `{ success, data, error, meta }` envelope (§9.1)
 *  - normalize every failure into a single `ApiError` throw
 *  - attach `Authorization: Bearer` when a call needs auth
 *  - attach `Idempotency-Key` to POST /checkout (§9.1)
 * Components never call fetch directly — they go through TanStack Query hooks.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;
  /** §9.5 validation_failed: per-field messages, when present. */
  readonly details: { field: string; message: string }[];

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number | null = null,
    details: { field: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function resolveUrl(path: string): string {
  if (/^https?:\/\//.test(apiBaseUrl)) return apiBaseUrl + path;
  const origin =
    typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost';
  return origin + apiBaseUrl + path;
}

const envelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().nullable(),
  // §9.1: `error` is always present (null on success); only `meta` is optional.
  error: apiErrorSchema.nullable(),
  meta: z.unknown().optional(),
});

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  schema: z.ZodType<T>;
  auth?: boolean;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

interface ApiResult<T> {
  data: T;
  meta: PaginationMeta | null;
}

export async function request<T>(path: string, options: RequestOptions<T>): Promise<ApiResult<T>> {
  const { method = 'GET', body, schema, auth = false, idempotencyKey, headers: extraHeaders, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (auth) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (extraHeaders) Object.assign(headers, extraHeaders);

  let response: Response;
  try {
    response = await fetch(resolveUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Send credentials so the guest session cart cookie (§9.2) rides along.
      // In mock mode this is same-origin and inert. In LIVE mode the API is a
      // different origin (VITE_API_BASE_URL), so this is a *credentialed
      // cross-origin* request and the backend MUST answer with a matching CORS
      // contract or the browser drops the response:
      //   Access-Control-Allow-Origin: <the exact storefront origin>  (never `*`)
      //   Access-Control-Allow-Credentials: true
      //   Access-Control-Allow-Headers: Authorization, Content-Type, Idempotency-Key
      // Tracked as a backend.md §9.2 follow-up (contract owned by the backend).
      credentials: 'include',
      signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('network', 'Network request failed. Check your connection and try again.');
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError('internal', `Unexpected non-JSON response (HTTP ${response.status}).`, response.status);
  }

  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new ApiError('internal', 'Malformed API response envelope.', response.status);
  }

  const { success, data, error, meta } = envelope.data;
  if (!success || !response.ok) {
    const code: ApiErrorCode = error?.code ?? 'internal';
    const message = error?.message ?? `Request failed (HTTP ${response.status}).`;
    throw new ApiError(code, message, response.status, error?.details ?? []);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(
      'invalid_response',
      'API response did not match the expected contract shape.',
      response.status,
    );
  }

  const metaParsed = paginationMetaSchema.safeParse(meta);
  return { data: parsed.data, meta: metaParsed.success ? metaParsed.data : null };
}

/* ---- Catalog endpoints (Phase 1) ---- */

export async function getProductTypes(signal?: AbortSignal): Promise<ProductType[]> {
  const { data } = await request('/product-types', {
    schema: z.array(productTypeSchema),
    signal,
  });
  return data;
}

export async function getProducts(
  params: ProductListParams,
  signal?: AbortSignal,
): Promise<ProductListResult> {
  const search = new URLSearchParams();
  if (params.type) search.set('type', params.type);
  if (params.q) search.set('q', params.q);
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  if (params.sort) search.set('sort', params.sort);
  const query = search.toString();

  const { data, meta } = await request(`/products${query ? `?${query}` : ''}`, {
    schema: productListSchema,
    signal,
  });

  const fallbackMeta: PaginationMeta = {
    total: data.length,
    page: params.page ?? 1,
    limit: params.limit ?? data.length,
  };
  return { items: data, meta: meta ?? fallbackMeta };
}

export async function getProduct(slug: string, signal?: AbortSignal): Promise<ProductDetail> {
  const { data } = await request(`/products/${encodeURIComponent(slug)}`, {
    schema: productDetailSchema,
    signal,
  });
  return data;
}

export async function searchProducts(
  query: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const { data } = await request('/search', {
    method: 'POST',
    body: { query, limit },
    schema: searchResponseSchema,
    signal,
  });
  return data;
}

/* ---- Cart (Phase 2, §9.4). Mutations return the whole latest cart. ---- */

export async function getCart(signal?: AbortSignal): Promise<Cart> {
  const { data } = await request('/cart', { schema: cartSchema, auth: true, signal });
  return data;
}

export async function addCartItem(input: AddCartItemInput, signal?: AbortSignal): Promise<Cart> {
  const { data } = await request('/cart/items', {
    method: 'POST',
    body: input,
    schema: cartSchema,
    auth: true,
    signal,
  });
  return data;
}

export async function updateCartItem(itemId: string, qty: number, signal?: AbortSignal): Promise<Cart> {
  const { data } = await request(`/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: { qty },
    schema: cartSchema,
    auth: true,
    signal,
  });
  return data;
}

export async function removeCartItem(itemId: string, signal?: AbortSignal): Promise<Cart> {
  const { data } = await request(`/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    schema: cartSchema,
    auth: true,
    signal,
  });
  return data;
}

/* ---- Checkout (§9.3). Idempotency-Key supplied by the caller. ---- */

/**
 * `idempotencyKey` is owned by the caller (the checkout hook), NOT minted here:
 * one key per *logical* checkout attempt, reused across retries so a retried
 * checkout replays the same order instead of creating a duplicate (§9.1, mirrors
 * the backend's checkout saga). Minting a fresh UUID per call would defeat the
 * header entirely — exactly the duplicate-order risk we're guarding against.
 *
 * `mockOutcome` injects a mock-only `X-Mock-Outcome` header used by MSW to
 * simulate success / failure / out-of-stock. A real backend ignores it; the
 * real payment result is decided by Stripe + the webhook (SPEC §7).
 */
export async function checkout(
  cartId: string,
  options: { idempotencyKey?: string; mockOutcome?: MockPaymentOutcome; signal?: AbortSignal } = {},
): Promise<CheckoutResponse> {
  const { data } = await request('/checkout', {
    method: 'POST',
    body: { cart_id: cartId },
    schema: checkoutResponseSchema,
    auth: true,
    idempotencyKey: options.idempotencyKey,
    headers: options.mockOutcome ? { 'X-Mock-Outcome': options.mockOutcome } : undefined,
    signal: options.signal,
  });
  return data;
}

/**
 * MOCK-ONLY: stands in for the user submitting the Payment Element + the Stripe
 * webhook landing. Never called in live mode (real flow uses Stripe.js).
 */
export async function confirmMockPayment(orderId: string, signal?: AbortSignal): Promise<void> {
  await request('/mock/confirm-payment', {
    method: 'POST',
    body: { order_id: orderId },
    schema: z.object({ status: z.string() }),
    signal,
  });
}

/* ---- Orders (§9.4) ---- */

export async function getOrders(
  page = 1,
  limit = 20,
  signal?: AbortSignal,
): Promise<OrderListResult> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
  const { data, meta } = await request(`/orders?${query}`, {
    schema: orderListSchema,
    auth: true,
    signal,
  });
  const fallbackMeta: PaginationMeta = { total: data.length, page, limit };
  return { orders: data, meta: meta ?? fallbackMeta };
}

export async function getOrder(id: string, signal?: AbortSignal): Promise<OrderDetail> {
  const { data } = await request(`/orders/${encodeURIComponent(id)}`, {
    schema: orderDetailSchema,
    auth: true,
    signal,
  });
  return data;
}
