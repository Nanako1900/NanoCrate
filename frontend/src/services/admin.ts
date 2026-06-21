import { z } from 'zod';
import { request } from './api';
import {
  adminOrderDetailSchema,
  adminOrderListSchema,
  adminProductDetailSchema,
  adminProductListSchema,
  adminProductTypeSchema,
  adminVariantSchema,
  dashboardSchema,
  inventoryListSchema,
  restockResultSchema,
  stockLedgerSchema,
  type AdminOrderDetail,
  type AdminOrderSummary,
  type AdminProductDetail,
  type AdminProductListItem,
  type AdminProductType,
  type AdminVariant,
  type DashboardData,
  type InventoryRow,
  type ProductWriteInput,
  type RestockResult,
  type StockLedgerEntry,
  type VariantWriteInput,
} from './admin-types';
import type { PaginationMeta } from './types';

/**
 * Admin API client — aligned to backend.md §9.5. Every call goes through the
 * shared `request` (envelope + Zod + auth header). All endpoints require the
 * admin role server-side (and the UI gates the routes via AdminRoute).
 */

export interface AdminProductListResult {
  items: AdminProductListItem[];
  meta: PaginationMeta;
}
export interface AdminOrderListResult {
  orders: AdminOrderSummary[];
  meta: PaginationMeta;
}
export interface InventoryListResult {
  rows: InventoryRow[];
  meta: PaginationMeta;
}
export interface StockLedgerResult {
  entries: StockLedgerEntry[];
  meta: PaginationMeta;
}

function metaOr(meta: PaginationMeta | null, total: number, page = 1, limit = total): PaginationMeta {
  return meta ?? { total, page, limit };
}

/* ---- Dashboard (frontend-only — NOT in §9.5; mock aggregates §9.5 data) ---- */
export async function getDashboard(signal?: AbortSignal): Promise<DashboardData> {
  const { data } = await request('/admin/dashboard', { schema: dashboardSchema, auth: true, signal });
  return data;
}

/* ---- Product types (attribute_schema drives the dynamic form) ---- */
export async function getAdminProductTypes(signal?: AbortSignal): Promise<AdminProductType[]> {
  const { data } = await request('/admin/product-types', {
    schema: z.array(adminProductTypeSchema),
    auth: true,
    signal,
  });
  return data;
}

export async function getAdminProductType(key: string, signal?: AbortSignal): Promise<AdminProductType> {
  const { data } = await request(`/admin/product-types/${encodeURIComponent(key)}`, {
    schema: adminProductTypeSchema,
    auth: true,
    signal,
  });
  return data;
}

/* ---- Products ---- */
// §9.5 supports q/status/page/limit; `type`/`sort` are client conveniences the
// mock honors (a live backend may ignore them).
export interface AdminProductQuery {
  q?: string;
  type?: string;
  status?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export async function getAdminProducts(
  query: AdminProductQuery = {},
  signal?: AbortSignal,
): Promise<AdminProductListResult> {
  const search = new URLSearchParams();
  if (query.q) search.set('q', query.q);
  if (query.type) search.set('type', query.type);
  if (query.status) search.set('status', query.status);
  if (query.page) search.set('page', String(query.page));
  if (query.limit) search.set('limit', String(query.limit));
  if (query.sort) search.set('sort', query.sort);
  const qs = search.toString();
  const { data, meta } = await request(`/admin/products${qs ? `?${qs}` : ''}`, {
    schema: adminProductListSchema,
    auth: true,
    signal,
  });
  return { items: data, meta: metaOr(meta, data.length, query.page ?? 1, query.limit ?? data.length) };
}

// NOTE: GET /admin/products/:id (detail + variants) is not yet specified in §9.5
// — flagged for backend. The mock returns the product with its variants joined.
export async function getAdminProduct(id: string, signal?: AbortSignal): Promise<AdminProductDetail> {
  const { data } = await request(`/admin/products/${encodeURIComponent(id)}`, {
    schema: adminProductDetailSchema,
    auth: true,
    signal,
  });
  return data;
}

export async function createProduct(input: ProductWriteInput): Promise<AdminProductDetail> {
  const { data } = await request('/admin/products', {
    method: 'POST',
    body: input,
    schema: adminProductDetailSchema,
    auth: true,
  });
  return data;
}

export async function updateProduct(id: string, input: Partial<ProductWriteInput>): Promise<AdminProductDetail> {
  const { data } = await request(`/admin/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    schema: adminProductDetailSchema,
    auth: true,
  });
  return data;
}

export async function archiveProduct(id: string): Promise<AdminProductDetail> {
  const { data } = await request(`/admin/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    schema: adminProductDetailSchema,
    auth: true,
  });
  return data;
}

/* ---- Variants (§9.5 write endpoints return the variant) ---- */
export async function createVariant(productId: string, input: VariantWriteInput): Promise<AdminVariant> {
  const { data } = await request(`/admin/products/${encodeURIComponent(productId)}/variants`, {
    method: 'POST',
    body: input,
    schema: adminVariantSchema,
    auth: true,
  });
  return data;
}

export async function updateVariant(variantId: string, input: Partial<VariantWriteInput>): Promise<AdminVariant> {
  const { data } = await request(`/admin/variants/${encodeURIComponent(variantId)}`, {
    method: 'PATCH',
    body: input,
    schema: adminVariantSchema,
    auth: true,
  });
  return data;
}

/* ---- Inventory + ledger ---- */
export interface InventoryQuery {
  low?: boolean;
  threshold?: number;
  page?: number;
  limit?: number;
}

export async function getInventory(query: InventoryQuery = {}, signal?: AbortSignal): Promise<InventoryListResult> {
  const search = new URLSearchParams();
  if (query.low) search.set('low', 'true');
  if (query.threshold !== undefined) search.set('threshold', String(query.threshold));
  if (query.page) search.set('page', String(query.page));
  if (query.limit) search.set('limit', String(query.limit));
  const qs = search.toString();
  const { data, meta } = await request(`/admin/inventory${qs ? `?${qs}` : ''}`, {
    schema: inventoryListSchema,
    auth: true,
    signal,
  });
  return { rows: data, meta: metaOr(meta, data.length, query.page ?? 1, query.limit ?? data.length) };
}

export async function getStockLedger(
  variantId: string,
  query: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<StockLedgerResult> {
  const search = new URLSearchParams();
  if (query.page) search.set('page', String(query.page));
  if (query.limit) search.set('limit', String(query.limit));
  const qs = search.toString();
  const { data, meta } = await request(`/admin/inventory/${encodeURIComponent(variantId)}/ledger${qs ? `?${qs}` : ''}`, {
    schema: stockLedgerSchema,
    auth: true,
    signal,
  });
  return { entries: data, meta: metaOr(meta, data.length, query.page ?? 1, query.limit ?? data.length) };
}

export async function restock(variantId: string, qty: number): Promise<RestockResult> {
  const { data } = await request(`/admin/inventory/${encodeURIComponent(variantId)}/restock`, {
    method: 'POST',
    body: { qty },
    schema: restockResultSchema,
    auth: true,
  });
  return data;
}

/* ---- Orders ---- */
export async function getAdminOrders(
  query: { status?: string; page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<AdminOrderListResult> {
  const search = new URLSearchParams();
  if (query.status) search.set('status', query.status);
  if (query.page) search.set('page', String(query.page));
  if (query.limit) search.set('limit', String(query.limit));
  const qs = search.toString();
  const { data, meta } = await request(`/admin/orders${qs ? `?${qs}` : ''}`, {
    schema: adminOrderListSchema,
    auth: true,
    signal,
  });
  return { orders: data, meta: metaOr(meta, data.length, query.page ?? 1, query.limit ?? data.length) };
}

export async function getAdminOrder(id: string, signal?: AbortSignal): Promise<AdminOrderDetail> {
  const { data } = await request(`/admin/orders/${encodeURIComponent(id)}`, {
    schema: adminOrderDetailSchema,
    auth: true,
    signal,
  });
  return data;
}
