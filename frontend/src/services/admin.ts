import { z } from 'zod';
import { request } from './api';
import {
  adminOrderDetailSchema,
  adminOrderListSchema,
  adminProductDetailSchema,
  adminProductListSchema,
  adminProductTypeSchema,
  dashboardSchema,
  inventoryListSchema,
  inventoryRowSchema,
  stockLedgerSchema,
  type AdminOrderDetail,
  type AdminOrderSummary,
  type AdminProductDetail,
  type AdminProductListItem,
  type AdminProductType,
  type DashboardData,
  type InventoryRow,
  type ProductWriteInput,
  type StockLedgerEntry,
  type VariantWriteInput,
} from './admin-types';
import type { PaginationMeta } from './types';

/**
 * Admin API client (PROPOSED §9.5). Every call goes through the shared `request`
 * (envelope unwrap + Zod validation + auth header). All endpoints require the
 * admin role server-side; the client also gates the routes (RBAC, AdminRoute).
 */

export interface AdminProductListResult {
  items: AdminProductListItem[];
  meta: PaginationMeta;
}
export interface AdminOrderListResult {
  orders: AdminOrderSummary[];
  meta: PaginationMeta;
}

/* ---- Dashboard ---- */
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
  const fallback: PaginationMeta = { total: data.length, page: query.page ?? 1, limit: query.limit ?? data.length };
  return { items: data, meta: meta ?? fallback };
}

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

/* ---- Variants ---- */
export async function createVariant(productId: string, input: VariantWriteInput): Promise<AdminProductDetail> {
  const { data } = await request(`/admin/products/${encodeURIComponent(productId)}/variants`, {
    method: 'POST',
    body: input,
    schema: adminProductDetailSchema,
    auth: true,
  });
  return data;
}

export async function updateVariant(
  variantId: string,
  input: Partial<VariantWriteInput>,
): Promise<AdminProductDetail> {
  const { data } = await request(`/admin/variants/${encodeURIComponent(variantId)}`, {
    method: 'PATCH',
    body: input,
    schema: adminProductDetailSchema,
    auth: true,
  });
  return data;
}

/* ---- Inventory + ledger ---- */
export async function getInventory(lowOnly = false, signal?: AbortSignal): Promise<InventoryRow[]> {
  const { data } = await request(`/admin/inventory${lowOnly ? '?low=1' : ''}`, {
    schema: inventoryListSchema,
    auth: true,
    signal,
  });
  return data;
}

export async function getStockLedger(variantId: string, signal?: AbortSignal): Promise<StockLedgerEntry[]> {
  const { data } = await request(`/admin/inventory/${encodeURIComponent(variantId)}/ledger`, {
    schema: stockLedgerSchema,
    auth: true,
    signal,
  });
  return data;
}

export async function restock(variantId: string, qty: number): Promise<InventoryRow> {
  const { data } = await request(`/admin/inventory/${encodeURIComponent(variantId)}/restock`, {
    method: 'POST',
    body: { qty },
    schema: inventoryRowSchema,
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
  const fallback: PaginationMeta = { total: data.length, page: query.page ?? 1, limit: query.limit ?? data.length };
  return { orders: data, meta: meta ?? fallback };
}

export async function getAdminOrder(id: string, signal?: AbortSignal): Promise<AdminOrderDetail> {
  const { data } = await request(`/admin/orders/${encodeURIComponent(id)}`, {
    schema: adminOrderDetailSchema,
    auth: true,
    signal,
  });
  return data;
}
