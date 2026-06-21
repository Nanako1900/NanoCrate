import { z } from 'zod';
import { attributesSchema, orderStatusSchema, paymentStatusSchema } from './types';

/**
 * Admin contract types — aligned to backend.md §9.5 (the source of truth).
 *
 * Shapes here mirror §9.5 1:1. Fields the backend does NOT send but the UI needs
 * are marked `// frontend-only` and kept optional so a real §9.5 response still
 * validates (e.g. variants joined into the product detail, image derived from
 * slug). Two endpoints the UI uses are NOT in §9.5 and are flagged at their call
 * sites: GET /admin/products/:id (detail+variants) and GET /admin/dashboard
 * (a frontend aggregation). The contract is a contract — flag drift, don't change
 * it unilaterally.
 */

/* ---- Dynamic attribute schema (★ flagship: schema → form) ---- */
export const attributeFieldTypeSchema = z.enum(['text', 'number', 'bool', 'select']);
export type AttributeFieldType = z.infer<typeof attributeFieldTypeSchema>;

// §9.5: a field is { name, type, required?, options? }. `required` defaults to
// false when absent. `label`/`help`/`unit`/`placeholder` are frontend-only
// display hints the backend may omit (derive a label from `name` if missing).
export const attributeFieldSchema = z.object({
  name: z.string(),
  type: attributeFieldTypeSchema,
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  label: z.string().optional(),
  help: z.string().optional(),
  unit: z.string().optional(),
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
  attribute_schema: attributeSchemaSchema,
  product_count: z.number().optional(), // frontend-only convenience
});
export type AdminProductType = z.infer<typeof adminProductTypeSchema>;

/* ---- Products ---- */
export const PRODUCT_STATUSES = ['active', 'draft', 'archived'] as const;
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export type ProductStatus = z.infer<typeof productStatusSchema>;

// §9.5 variant write response: { id, product_id, sku, name, price_cents,
// currency, status, attributes, available }. `reserved` is frontend-only (joined
// from inventory for the editor's display).
export const adminVariantSchema = z.object({
  id: z.string(),
  product_id: z.string().optional(),
  sku: z.string(),
  name: z.string(),
  price_cents: z.number(),
  currency: z.string(),
  status: productStatusSchema.optional(),
  attributes: attributesSchema,
  available: z.number(),
  reserved: z.number().optional(), // frontend-only
});
export type AdminVariant = z.infer<typeof adminVariantSchema>;

// §9.5 GET /admin/products list item.
export const adminProductListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  status: productStatusSchema,
  variant_count: z.number(),
  price_range_cents: z.object({ min: z.number(), max: z.number() }),
  total_available: z.number(),
});
export type AdminProductListItem = z.infer<typeof adminProductListItemSchema>;
export const adminProductListSchema = z.array(adminProductListItemSchema);

// §9.5 product write response: { id, slug, name, type, status, description,
// attributes }. `variants` is frontend-only — present on GET /admin/products/:id
// (which §9.5 does not yet specify), absent on create/patch responses.
export const adminProductDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  status: productStatusSchema,
  description: z.string(),
  attributes: attributesSchema,
  variants: z.array(adminVariantSchema).optional(), // frontend-only (GET detail)
});
export type AdminProductDetail = z.infer<typeof adminProductDetailSchema>;

/* ---- Inventory + stock ledger (★ concurrency showcase) ---- */
// §9.5 GET /admin/inventory row.
export const inventoryRowSchema = z.object({
  variant_id: z.string(),
  sku: z.string(),
  product_name: z.string(),
  available: z.number(),
  reserved: z.number(),
});
export type InventoryRow = z.infer<typeof inventoryRowSchema>;
export const inventoryListSchema = z.array(inventoryRowSchema);

// §9.5 POST /admin/inventory/:variant_id/restock response.
export const restockResultSchema = z.object({
  variant_id: z.string(),
  available: z.number(),
  reserved: z.number(),
});
export type RestockResult = z.infer<typeof restockResultSchema>;

export const LEDGER_KINDS = ['reserve', 'commit', 'release', 'expire', 'restock'] as const;
export const ledgerKindSchema = z.enum(LEDGER_KINDS);
export type LedgerKind = z.infer<typeof ledgerKindSchema>;

// §9.5 GET /admin/inventory/:variant_id/ledger entry (two signed deltas).
export const stockLedgerEntrySchema = z.object({
  id: z.number(),
  kind: ledgerKindSchema,
  delta_available: z.number(),
  delta_reserved: z.number(),
  reservation_id: z.string().nullable(),
  created_at: z.string(),
});
export type StockLedgerEntry = z.infer<typeof stockLedgerEntrySchema>;
export const stockLedgerSchema = z.array(stockLedgerEntrySchema);

/* ---- Orders (admin reuses §9.4 + user_id, status filter) ---- */
export const adminOrderSummarySchema = z.object({
  id: z.string(),
  user_id: z.string(),
  status: orderStatusSchema,
  total_cents: z.number(),
  currency: z.string(),
  item_count: z.number(),
  created_at: z.string(),
});
export type AdminOrderSummary = z.infer<typeof adminOrderSummarySchema>;
export const adminOrderListSchema = z.array(adminOrderSummarySchema);

export const adminOrderItemSchema = z.object({
  sku: z.string(),
  name: z.string(),
  unit_price_cents: z.number(),
  qty: z.number(),
  line_total_cents: z.number(),
});

// §9.5: admin order detail reuses the §9.4 order shape (+ user_id).
export const adminOrderDetailSchema = z.object({
  id: z.string(),
  user_id: z.string().optional(),
  status: orderStatusSchema,
  currency: z.string(),
  subtotal_cents: z.number(),
  total_cents: z.number(),
  payment: z.object({ provider: z.string(), status: paymentStatusSchema }),
  items: z.array(adminOrderItemSchema),
  created_at: z.string(),
});
export type AdminOrderDetail = z.infer<typeof adminOrderDetailSchema>;

/* ---- Dashboard (frontend-only — NOT in §9.5) ----
 * The dashboard is a frontend aggregation for the demo. In live mode it would be
 * a backend endpoint or computed client-side from §9.5 (orders/inventory). The
 * stock-conflict count is a mock-only metric. Flagged at the call site. */
export const dashboardSchema = z.object({
  kpis: z.object({
    revenue_cents: z.number(),
    orders_count: z.number(),
    conversion_rate: z.number(),
    low_stock_count: z.number(),
    stock_conflict_count: z.number(),
  }),
  recent_orders: z.array(adminOrderSummarySchema),
  low_stock: z.array(inventoryRowSchema),
  order_trend: z.array(z.object({ date: z.string(), orders: z.number(), revenue_cents: z.number() })),
  top_sellers: z.array(z.object({ name: z.string(), units: z.number() })),
});
export type DashboardData = z.infer<typeof dashboardSchema>;

/* ---- Write payloads (mirror §9.5 admin endpoints) ---- */
export interface ProductWriteInput {
  name: string;
  slug?: string;
  type: string;
  description: string;
  status: ProductStatus;
  attributes: Record<string, string | number | boolean>;
}

export interface VariantWriteInput {
  sku: string;
  name: string;
  price_cents: number;
  currency?: string;
  status?: ProductStatus;
  attributes: Record<string, string | number | boolean>;
  // frontend-only convenience: §9.5 variant create starts at available:0 and all
  // stock moves go through restock. The mock seeds this as a `restock` ledger
  // entry; a live backend would ignore it (set initial stock via restock).
  available: number;
}

/** §9.5 validation_failed carries error.details[] locating each bad field. */
export interface ValidationDetail {
  field: string;
  message: string;
}
