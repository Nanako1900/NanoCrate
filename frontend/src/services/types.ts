import { z } from 'zod';

/**
 * Contract types — a 1:1 mirror of backend.md §9 (the single source of truth).
 * Zod schemas double as runtime validators at the API boundary (input
 * validation per coding rules) and as the origin of the inferred TS types.
 */

/* ---- Envelope & errors (§9.1) ---- */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ApiErrorPayload = z.infer<typeof apiErrorSchema>;

export const paginationMetaSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/** Documented error codes (§9.1). Open set: the server may add others. */
export const API_ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'not_found',
  'validation_failed',
  'out_of_stock',
  'payment_failed',
  'conflict',
  'internal',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number] | (string & {});

/* ---- Flexible attributes (JSONB per SPEC §5) ---- */
export const attributesSchema = z.record(z.union([z.string(), z.number(), z.boolean()]));
export type Attributes = z.infer<typeof attributesSchema>;

/* ---- Product type (§9.2 GET /product-types) ----
 * NOTE: §9 does not pin the /product-types payload shape. Modeled from the
 * SPEC §5 DDL (key, name); `product_count` is an additive, optional storefront
 * convenience and is safe to ignore if the backend omits it. Flag any change.
 */
export const productTypeSchema = z.object({
  key: z.string(),
  name: z.string(),
  product_count: z.number().optional(),
});
export type ProductType = z.infer<typeof productTypeSchema>;

/* ---- Product list item (§9.3 GET /products) ---- */
export const productListItemSchema = z.object({
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  price_from_cents: z.number(),
  currency: z.string(),
  attributes: attributesSchema,
  image: z.string(),
});
export type ProductListItem = z.infer<typeof productListItemSchema>;
export const productListSchema = z.array(productListItemSchema);

/* ---- Variant + product detail (§9.3 GET /products/:slug) ---- */
export const variantSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  price_cents: z.number(),
  currency: z.string(),
  attributes: attributesSchema,
  available: z.number(),
});
export type Variant = z.infer<typeof variantSchema>;

export const productDetailSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.string(),
  attributes: attributesSchema,
  variants: z.array(variantSchema),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

/* ---- Search (§9.3 POST /search) ---- */
export const searchHitSchema = z.object({
  slug: z.string(),
  score: z.number(),
  name: z.string(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchResponseSchema = z.object({
  hits: z.array(searchHitSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

/* ---- Checkout (§9.3 POST /checkout) ---- */
export const checkoutResponseSchema = z.object({
  order_id: z.string(),
  client_secret: z.string(),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

/* ---- Client-side query shapes for GET /products ---- */
export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export interface ProductListParams {
  type?: string;
  q?: string;
  page?: number;
  limit?: number;
  sort?: ProductSort;
}

export interface ProductListResult {
  items: ProductListItem[];
  meta: PaginationMeta;
}

/* ---- Cart (§9.4 GET /cart · POST/PATCH/DELETE /cart/items) ----
 * Every mutation returns the whole latest cart so the client can replace cache. */
export const cartItemSchema = z.object({
  id: z.string(),
  variant_id: z.string(),
  sku: z.string(),
  name: z.string(),
  unit_price_cents: z.number(),
  qty: z.number(),
  line_total_cents: z.number(),
  available: z.number(),
});
export type CartItem = z.infer<typeof cartItemSchema>;

export const cartSchema = z.object({
  id: z.string(),
  currency: z.string(),
  item_count: z.number(),
  subtotal_cents: z.number(),
  items: z.array(cartItemSchema),
});
export type Cart = z.infer<typeof cartSchema>;

export interface AddCartItemInput {
  variant_id: string;
  qty: number;
}

/** Mock-only checkout simulation outcome (drives the X-Mock-Outcome header). */
export type MockPaymentOutcome = 'succeeded' | 'failed' | 'out_of_stock';

/* ---- Orders (§9.4 GET /orders · GET /orders/:id) ---- */
export const orderStatusSchema = z.enum(['pending', 'paid', 'failed', 'cancelled', 'fulfilled']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export const ORDER_STATUSES = orderStatusSchema.options;

export const paymentStatusSchema = z.enum(['requires_payment', 'succeeded', 'failed']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const orderSummarySchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  total_cents: z.number(),
  currency: z.string(),
  item_count: z.number(),
  created_at: z.string(),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;
export const orderListSchema = z.array(orderSummarySchema);

export const orderItemSchema = z.object({
  sku: z.string(),
  name: z.string(),
  unit_price_cents: z.number(),
  qty: z.number(),
  line_total_cents: z.number(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderDetailSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  currency: z.string(),
  subtotal_cents: z.number(),
  total_cents: z.number(),
  payment: z.object({
    provider: z.string(),
    status: paymentStatusSchema,
  }),
  items: z.array(orderItemSchema),
  created_at: z.string(),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

export interface OrderListResult {
  orders: OrderSummary[];
  meta: PaginationMeta;
}
