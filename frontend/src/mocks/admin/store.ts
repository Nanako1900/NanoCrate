import type {
  AdminOrderDetail,
  AdminOrderSummary,
  AdminProductDetail,
  AdminProductListItem,
  AdminVariant,
  DashboardData,
  InventoryRow,
  LedgerKind,
  ProductStatus,
  RestockResult,
  StockLedgerEntry,
} from '@/services/admin-types';
import type { OrderStatus, PaymentStatus } from '@/services/types';
import { mockProducts } from '../fixtures/products';
import { ADMIN_ATTRIBUTE_SCHEMAS } from './schemas';

/**
 * In-memory admin backend (mock), emitting the §9.5 shapes. Seeds products /
 * variants from the storefront fixtures and maintains available/reserved
 * inventory + an append-only stock ledger (two signed deltas, the concurrency
 * showcase), admin orders keyed by user_id, and a stock-conflict counter for the
 * (frontend-only) dashboard. __resetAdminStore restores the seed.
 */

const DEFAULT_THRESHOLD = 5;
const CURRENCY = 'USD';

interface ProductRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: string;
  status: ProductStatus;
  attributes: Record<string, string | number | boolean>;
  variantIds: string[];
}

interface VariantRecord {
  id: string;
  productId: string;
  sku: string;
  name: string;
  price_cents: number;
  status: ProductStatus;
  attributes: Record<string, string | number | boolean>;
  available: number;
  reserved: number;
}

interface LedgerRecord {
  id: number;
  variantId: string;
  kind: LedgerKind;
  delta_available: number;
  delta_reserved: number;
  reservation_id: string | null;
  created_at: string;
}

interface OrderRecord {
  id: string;
  userId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  items: { sku: string; name: string; unit_price_cents: number; qty: number; line_total_cents: number }[];
  subtotal_cents: number;
  total_cents: number;
  createdAt: string;
}

let products = new Map<string, ProductRecord>();
let variants = new Map<string, VariantRecord>();
let ledger: LedgerRecord[] = [];
let orders = new Map<string, OrderRecord>();
let stockConflicts = 0;
let seq = { product: 0, variant: 0, ledger: 0, order: 0 };

const ISO = (offsetDays: number, hour = 10): string => {
  const d = new Date('2026-06-21T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - offsetDays);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

function pushLedger(
  variantId: string,
  kind: LedgerKind,
  deltaAvailable: number,
  deltaReserved: number,
  reservationId: string | null,
  at: string,
): void {
  ledger.push({
    id: (seq.ledger += 1),
    variantId,
    kind,
    delta_available: deltaAvailable,
    delta_reserved: deltaReserved,
    reservation_id: reservationId,
    created_at: at,
  });
}

function seed(): void {
  products = new Map();
  variants = new Map();
  ledger = [];
  orders = new Map();
  stockConflicts = 3;
  seq = { product: 0, variant: 0, ledger: 0, order: 0 };

  mockProducts.forEach((product, pIndex) => {
    const productId = `p_${String((seq.product += 1)).padStart(2, '0')}`;
    const variantIds: string[] = [];
    product.variants.forEach((v, vIndex) => {
      const variantId = `v_${String((seq.variant += 1)).padStart(2, '0')}`;
      const reserved = v.available > 0 ? (vIndex + pIndex) % 4 : 0;
      variants.set(variantId, {
        id: variantId,
        productId,
        sku: v.sku,
        name: v.name,
        price_cents: v.price_cents,
        status: 'active',
        attributes: v.attributes,
        available: v.available,
        reserved,
      });
      variantIds.push(variantId);
      pushLedger(variantId, 'restock', v.available + reserved, 0, null, ISO(20, 9));
      if (reserved > 0) pushLedger(variantId, 'reserve', -reserved, reserved, `r_${String(seq.ledger).padStart(2, '0')}`, ISO(2, 11 + (vIndex % 6)));
    });
    products.set(productId, {
      id: productId,
      slug: product.slug,
      name: product.name,
      description: product.description,
      type: product.type,
      status: 'active',
      attributes: product.attributes,
      variantIds,
    });
  });

  const orderSeeds: { status: OrderStatus; payment: PaymentStatus; daysAgo: number; lines: [string, number][] }[] = [
    { status: 'paid', payment: 'succeeded', daysAgo: 0, lines: [['NANO75-RED-PBTW', 1], ['KC-BENTO-BASE', 1]] },
    { status: 'fulfilled', payment: 'succeeded', daysAgo: 1, lines: [['NANO60-RED-PBTW', 2]] },
    { status: 'paid', payment: 'succeeded', daysAgo: 1, lines: [['NANOTKL-BRN-PBTC', 1]] },
    { status: 'pending', payment: 'requires_payment', daysAgo: 0, lines: [['NANOFULL-SLT-PBTW', 1]] },
    { status: 'cancelled', payment: 'failed', daysAgo: 3, lines: [['NANO75-SLT-PBTW', 1]] },
    { status: 'failed', payment: 'failed', daysAgo: 4, lines: [['NANO65-RED-PBTW', 1]] },
    { status: 'fulfilled', payment: 'succeeded', daysAgo: 5, lines: [['SW-RED-70', 3]] },
    { status: 'paid', payment: 'succeeded', daysAgo: 2, lines: [['NANO1800-BRN-PBTC', 1], ['SW-BRN-70', 1]] },
  ];
  const skuIndex = new Map<string, VariantRecord>();
  for (const v of variants.values()) skuIndex.set(v.sku, v);

  orderSeeds.forEach((o, i) => {
    const id = `o_${String((seq.order += 1)).padStart(2, '0')}`;
    const items = o.lines.flatMap(([sku, qty]) => {
      const v = skuIndex.get(sku);
      if (!v) return [];
      return [{ sku: v.sku, name: v.name, unit_price_cents: v.price_cents, qty, line_total_cents: v.price_cents * qty }];
    });
    const subtotal = items.reduce((s, it) => s + it.line_total_cents, 0);
    orders.set(id, {
      id,
      userId: `kc-sub-${100 + i}`,
      status: o.status,
      paymentStatus: o.payment,
      items,
      subtotal_cents: subtotal,
      total_cents: subtotal,
      createdAt: ISO(o.daysAgo, 9 + (i % 8)),
    });
  });
}

seed();

/* ---- Projections (§9.5 shapes) ---- */

function toAdminVariant(v: VariantRecord): AdminVariant {
  return {
    id: v.id,
    product_id: v.productId,
    sku: v.sku,
    name: v.name,
    price_cents: v.price_cents,
    currency: CURRENCY,
    status: v.status,
    attributes: v.attributes,
    available: v.available,
    reserved: v.reserved, // frontend-only (joined from inventory for the editor)
  };
}

function productVariants(record: ProductRecord): VariantRecord[] {
  return record.variantIds.map((id) => variants.get(id)).filter((v): v is VariantRecord => Boolean(v));
}

export function toListItem(record: ProductRecord): AdminProductListItem {
  const vs = productVariants(record);
  const prices = vs.map((v) => v.price_cents);
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    type: record.type,
    status: record.status,
    variant_count: vs.length,
    price_range_cents: { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 },
    total_available: vs.reduce((s, v) => s + v.available, 0),
  };
}

export function toDetail(record: ProductRecord): AdminProductDetail {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    description: record.description,
    type: record.type,
    status: record.status,
    attributes: record.attributes,
    variants: productVariants(record).map(toAdminVariant),
  };
}

export function toInventoryRow(v: VariantRecord): InventoryRow {
  const product = products.get(v.productId);
  return {
    variant_id: v.id,
    sku: v.sku,
    product_name: product?.name ?? '—',
    available: v.available,
    reserved: v.reserved,
  };
}

function toLedgerEntry(r: LedgerRecord): StockLedgerEntry {
  return {
    id: r.id,
    kind: r.kind,
    delta_available: r.delta_available,
    delta_reserved: r.delta_reserved,
    reservation_id: r.reservation_id,
    created_at: r.created_at,
  };
}

function toOrderSummary(o: OrderRecord): AdminOrderSummary {
  return {
    id: o.id,
    user_id: o.userId,
    status: o.status,
    total_cents: o.total_cents,
    currency: CURRENCY,
    item_count: o.items.reduce((s, it) => s + it.qty, 0),
    created_at: o.createdAt,
  };
}

/* ---- Validation (attributes against the type's attribute_schema → §9.5 details[]) ---- */
export interface ValidationFailure {
  field: string;
  message: string;
}

export function validateAttributes(typeKey: string, attributes: Record<string, unknown>): ValidationFailure[] {
  const schema = ADMIN_ATTRIBUTE_SCHEMAS[typeKey];
  if (!schema) return [{ field: 'type', message: `unknown product type "${typeKey}"` }];
  const failures: ValidationFailure[] = [];
  const known = new Set(schema.fields.map((f) => f.name));
  for (const field of schema.fields) {
    const value = attributes[field.name];
    const missing = value === undefined || value === null || value === '';
    if (field.required && field.type !== 'bool' && missing) {
      failures.push({ field: field.name, message: `${field.name} is required` });
      continue;
    }
    if (missing) continue;
    if (field.type === 'number' && typeof value !== 'number') failures.push({ field: field.name, message: `${field.name} must be a number` });
    if (field.type === 'bool' && typeof value !== 'boolean') failures.push({ field: field.name, message: `${field.name} must be a boolean` });
    if (field.type === 'select' && field.options && !field.options.includes(String(value)))
      failures.push({ field: field.name, message: `must be one of [${field.options.join(' ')}]` });
  }
  for (const key of Object.keys(attributes)) if (!known.has(key)) failures.push({ field: key, message: 'unknown attribute' });
  return failures;
}

/* ---- Queries ---- */
export interface ProductQuery {
  q?: string;
  type?: string;
  status?: string;
  sort?: string;
}

export function listProducts(query: ProductQuery): AdminProductListItem[] {
  let items = [...products.values()].map(toListItem);
  if (query.type) items = items.filter((p) => p.type === query.type);
  if (query.status) items = items.filter((p) => p.status === query.status);
  if (query.q) {
    const q = query.q.toLowerCase();
    items = items.filter((p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
  }
  const [key, dir] = (query.sort ?? 'name:asc').split(':');
  const factor = dir === 'desc' ? -1 : 1;
  items.sort((a, b) => {
    switch (key) {
      case 'price':
        return (a.price_range_cents.min - b.price_range_cents.min) * factor;
      case 'stock':
        return (a.total_available - b.total_available) * factor;
      case 'status':
        return a.status.localeCompare(b.status) * factor;
      default:
        return a.name.localeCompare(b.name) * factor;
    }
  });
  return items;
}

export function getProductDetail(id: string): AdminProductDetail | null {
  const record = products.get(id);
  return record ? toDetail(record) : null;
}

export function listInventory(low: boolean, threshold = DEFAULT_THRESHOLD): InventoryRow[] {
  let rows = [...variants.values()];
  if (low) rows = rows.filter((v) => v.available <= threshold);
  return rows.sort((a, b) => a.available - b.available).map(toInventoryRow);
}

export function getLedger(variantId: string): StockLedgerEntry[] | null {
  if (!variants.has(variantId)) return null;
  return ledger
    .filter((e) => e.variantId === variantId)
    .sort((a, b) => b.id - a.id)
    .map(toLedgerEntry);
}

export function listOrders(status?: string): AdminOrderSummary[] {
  let list = [...orders.values()];
  if (status) list = list.filter((o) => o.status === status);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toOrderSummary);
}

export function getOrderDetail(id: string): AdminOrderDetail | null {
  const o = orders.get(id);
  if (!o) return null;
  return {
    id: o.id,
    user_id: o.userId,
    status: o.status,
    currency: CURRENCY,
    subtotal_cents: o.subtotal_cents,
    total_cents: o.total_cents,
    payment: { provider: 'stripe', status: o.paymentStatus },
    items: o.items,
    created_at: o.createdAt,
  };
}

/* ---- Mutations ---- */
export function nextSlug(name: string, requested?: string): string {
  const base = (requested || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product';
  let slug = base;
  let n = 2;
  const taken = new Set([...products.values()].map((p) => p.slug));
  while (taken.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

export interface CreateProductInput {
  name: string;
  slug?: string;
  type: string;
  description: string;
  status: ProductStatus;
  attributes: Record<string, string | number | boolean>;
}

export function createProduct(input: CreateProductInput): AdminProductDetail {
  const id = `p_${String((seq.product += 1)).padStart(2, '0')}`;
  products.set(id, {
    id,
    slug: nextSlug(input.name, input.slug),
    name: input.name,
    description: input.description,
    type: input.type,
    status: input.status,
    attributes: input.attributes,
    variantIds: [],
  });
  return toDetail(products.get(id)!);
}

export function updateProduct(id: string, input: Partial<CreateProductInput>): AdminProductDetail | null {
  const record = products.get(id);
  if (!record) return null;
  Object.assign(record, {
    name: input.name ?? record.name,
    slug: input.slug ?? record.slug,
    description: input.description ?? record.description,
    type: input.type ?? record.type,
    status: input.status ?? record.status,
    attributes: input.attributes ?? record.attributes,
  });
  return toDetail(record);
}

export function archiveProduct(id: string): AdminProductDetail | null {
  const record = products.get(id);
  if (!record) return null;
  record.status = 'archived';
  return toDetail(record);
}

export interface CreateVariantInput {
  sku: string;
  name: string;
  price_cents: number;
  status?: ProductStatus;
  attributes: Record<string, string | number | boolean>;
  available: number;
}

export function skuExists(sku: string, exceptVariantId?: string): boolean {
  for (const v of variants.values()) if (v.sku === sku && v.id !== exceptVariantId) return true;
  return false;
}

export function createVariant(productId: string, input: CreateVariantInput): AdminVariant | null {
  const product = products.get(productId);
  if (!product) return null;
  const id = `v_${String((seq.variant += 1)).padStart(2, '0')}`;
  variants.set(id, {
    id,
    productId,
    sku: input.sku,
    name: input.name,
    price_cents: input.price_cents,
    status: input.status ?? 'active',
    attributes: input.attributes,
    available: input.available,
    reserved: 0,
  });
  product.variantIds.push(id);
  if (input.available > 0) pushLedger(id, 'restock', input.available, 0, null, new Date().toISOString());
  return toAdminVariant(variants.get(id)!);
}

export function updateVariant(variantId: string, input: Partial<CreateVariantInput>): AdminVariant | null {
  const v = variants.get(variantId);
  if (!v) return null;
  if (input.sku !== undefined) v.sku = input.sku;
  if (input.name !== undefined) v.name = input.name;
  if (input.price_cents !== undefined) v.price_cents = input.price_cents;
  if (input.status !== undefined) v.status = input.status;
  if (input.attributes !== undefined) v.attributes = input.attributes;
  if (input.available !== undefined && input.available !== v.available) {
    const delta = input.available - v.available;
    v.available = input.available;
    pushLedger(variantId, delta >= 0 ? 'restock' : 'commit', delta, 0, null, new Date().toISOString());
  }
  return toAdminVariant(v);
}

export function restock(variantId: string, qty: number): RestockResult | null {
  const v = variants.get(variantId);
  if (!v) return null;
  v.available += qty;
  pushLedger(variantId, 'restock', qty, 0, null, new Date().toISOString());
  return { variant_id: v.id, available: v.available, reserved: v.reserved };
}

export function variantById(id: string): VariantRecord | undefined {
  return variants.get(id);
}

/* ---- Dashboard (frontend-only aggregation) ---- */
export function getDashboard(): DashboardData {
  const orderList = [...orders.values()];
  const paid = orderList.filter((o) => o.status === 'paid' || o.status === 'fulfilled');
  const revenue = paid.reduce((s, o) => s + o.total_cents, 0);
  const inventory = [...variants.values()];
  const low = inventory.filter((v) => v.available <= DEFAULT_THRESHOLD).map(toInventoryRow);

  const trend = Array.from({ length: 14 }).map((_, i) => {
    const day = 13 - i;
    const date = ISO(day, 0).slice(0, 10);
    const dayOrders = orderList.filter((o) => o.createdAt.slice(0, 10) === date);
    const seedN = (day * 7 + 3) % 9;
    return { date, orders: dayOrders.length + seedN, revenue_cents: dayOrders.reduce((s, o) => s + o.total_cents, 0) + seedN * 9900 };
  });

  const sellerCounts = new Map<string, number>();
  for (const o of orderList) for (const it of o.items) sellerCounts.set(it.name, (sellerCounts.get(it.name) ?? 0) + it.qty);
  const topSellers = [...sellerCounts.entries()].map(([name, units]) => ({ name, units })).sort((a, b) => b.units - a.units).slice(0, 5);

  return {
    kpis: {
      revenue_cents: revenue,
      orders_count: orderList.length,
      conversion_rate: 0.034,
      low_stock_count: low.length,
      stock_conflict_count: stockConflicts,
    },
    recent_orders: orderList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map(toOrderSummary),
    low_stock: low.slice(0, 6),
    order_trend: trend,
    top_sellers: topSellers,
  };
}

/** Test-only: restore the seeded admin state. */
export function __resetAdminStore(): void {
  seed();
}
