import { z } from 'zod';
import { attributesSchema, orderStatusSchema, paymentStatusSchema } from './types';

/**
 * Admin contract types (PROPOSED §9.5).
 *
 * backend.md §9 is firm only through §9.4 (storefront). The admin *paths* are
 * listed in §9.2 (POST/PATCH/DELETE /admin/products, /admin/variants,
 * /admin/inventory/:id/restock, GET /admin/orders); the request/response
 * *shapes* below — plus the read endpoints the UI needs (list/detail, inventory,
 * stock ledger, dashboard, product-type attribute_schema) — are drafted here from
 * design-brief §8 to unblock mock-first development. These mirror the storefront
 * envelope/pagination conventions and MUST be reconciled with §9.5 once the
 * backend lands it. The contract is a contract: do not change it unilaterally —
 * flag drift instead.
 */

/* ---- Dynamic attribute schema (★ flagship: schema → form) ---- */
export const attributeFieldTypeSchema = z.enum(['text', 'number', 'bool', 'select']);
export type AttributeFieldType = z.infer<typeof attributeFieldTypeSchema>;

export const attributeFieldSchema = z.object({
  name: z.string(), // attribute key stored in product.attributes
  label: z.string(),
  type: attributeFieldTypeSchema,
  required: z.boolean(),
  options: z.array(z.string()).optional(), // for type=select
  help: z.string().optional(),
  unit: z.string().optional(), // e.g. "g" for actuation force
  placeholder: z.string().optional(),
});
export type AttributeField = z.infer<typeof attributeFieldSchema>;

export const attributeSchemaSchema = z.object({
  fields: z.array(attributeFieldSchema),
});
export type AttributeSchema = z.infer<typeof attributeSchemaSchema>;

export const adminProductTypeSchema = z.object({
  key: z.string(),
  name: z.string(),
  product_count: z.number().optional(),
  attribute_schema: attributeSchemaSchema,
});
export type AdminProductType = z.infer<typeof adminProductTypeSchema>;

/* ---- Products ---- */
export const PRODUCT_STATUSES = ['active', 'draft', 'archived'] as const;
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const adminVariantSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  price_cents: z.number(),
  currency: z.string(),
  attributes: attributesSchema,
  available: z.number(),
  reserved: z.number(),
});
export type AdminVariant = z.infer<typeof adminVariantSchema>;

export const adminProductListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  status: productStatusSchema,
  variant_count: z.number(),
  price_min_cents: z.number(),
  price_max_cents: z.number(),
  currency: z.string(),
  total_available: z.number(),
  image: z.string(),
  updated_at: z.string(),
});
export type AdminProductListItem = z.infer<typeof adminProductListItemSchema>;
export const adminProductListSchema = z.array(adminProductListItemSchema);

export const adminProductDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.string(),
  status: productStatusSchema,
  attributes: attributesSchema,
  variants: z.array(adminVariantSchema),
  created_at: z.string(),
  updated_at: z.string(),
});
export type AdminProductDetail = z.infer<typeof adminProductDetailSchema>;

/* ---- Inventory + stock ledger (★ concurrency showcase) ---- */
export const inventoryRowSchema = z.object({
  variant_id: z.string(),
  sku: z.string(),
  product_name: z.string(),
  variant_name: z.string(),
  available: z.number(),
  reserved: z.number(),
  on_hand: z.number(), // available + reserved (physical)
  low_stock_threshold: z.number(),
  is_low: z.boolean(),
});
export type InventoryRow = z.infer<typeof inventoryRowSchema>;
export const inventoryListSchema = z.array(inventoryRowSchema);

export const LEDGER_KINDS = ['reserve', 'commit', 'release', 'restock'] as const;
export const ledgerKindSchema = z.enum(LEDGER_KINDS);
export type LedgerKind = z.infer<typeof ledgerKindSchema>;

export const stockLedgerEntrySchema = z.object({
  id: z.string(),
  variant_id: z.string(),
  kind: ledgerKindSchema,
  delta: z.number(), // signed change to `available`
  available_after: z.number(),
  order_id: z.string().nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
});
export type StockLedgerEntry = z.infer<typeof stockLedgerEntrySchema>;
export const stockLedgerSchema = z.array(stockLedgerEntrySchema);

/* ---- Orders (admin view) ---- */
export const adminOrderSummarySchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  total_cents: z.number(),
  currency: z.string(),
  item_count: z.number(),
  customer_email: z.string(),
  created_at: z.string(),
});
export type AdminOrderSummary = z.infer<typeof adminOrderSummarySchema>;
export const adminOrderListSchema = z.array(adminOrderSummarySchema);

export const orderTimelineEventSchema = z.object({
  status: z.string(),
  at: z.string(),
  note: z.string().nullable(),
});
export type OrderTimelineEvent = z.infer<typeof orderTimelineEventSchema>;

export const adminOrderItemSchema = z.object({
  sku: z.string(),
  name: z.string(),
  unit_price_cents: z.number(),
  qty: z.number(),
  line_total_cents: z.number(),
});

export const adminOrderDetailSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  currency: z.string(),
  subtotal_cents: z.number(),
  total_cents: z.number(),
  customer: z.object({ name: z.string(), email: z.string() }),
  payment: z.object({ provider: z.string(), status: paymentStatusSchema }),
  items: z.array(adminOrderItemSchema),
  timeline: z.array(orderTimelineEventSchema),
  created_at: z.string(),
});
export type AdminOrderDetail = z.infer<typeof adminOrderDetailSchema>;

/* ---- Dashboard ---- */
export const dashboardSchema = z.object({
  kpis: z.object({
    revenue_cents: z.number(),
    orders_count: z.number(),
    conversion_rate: z.number(), // 0..1
    low_stock_count: z.number(),
    stock_conflict_count: z.number(), // ★ oversell attempts rejected by the saga
  }),
  recent_orders: z.array(adminOrderSummarySchema),
  low_stock: z.array(inventoryRowSchema),
  order_trend: z.array(
    z.object({ date: z.string(), orders: z.number(), revenue_cents: z.number() }),
  ),
  top_sellers: z.array(z.object({ name: z.string(), units: z.number() })),
});
export type DashboardData = z.infer<typeof dashboardSchema>;

/* ---- Write payloads (mirror §9.2 admin endpoints) ---- */
export interface ProductWriteInput {
  name: string;
  type: string;
  description: string;
  status: ProductStatus;
  attributes: Record<string, string | number | boolean>;
}

export interface VariantWriteInput {
  sku: string;
  name: string;
  price_cents: number;
  attributes: Record<string, string | number | boolean>;
  available: number;
}
