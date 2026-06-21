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
  StockLedgerEntry,
} from '@/services/admin-types';
import type { OrderStatus, PaymentStatus } from '@/services/types';
import { mockProducts } from '../fixtures/products';
import { ADMIN_ATTRIBUTE_SCHEMAS } from './schemas';

/**
 * In-memory admin backend (mock). Self-contained: seeds products/variants from
 * the storefront fixtures and maintains its own available/reserved inventory, an
 * append-only stock ledger (reserve/commit/release/restock — the concurrency
 * showcase), admin orders with customers + timelines, and a running
 * stock-conflict counter. Reset by __resetAdminStore for test isolation.
 */

const LOW_STOCK_THRESHOLD = 5;
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
  createdAt: string;
  updatedAt: string;
}

interface VariantRecord {
  id: string;
  productId: string;
  sku: string;
  name: string;
  price_cents: number;
  attributes: Record<string, string | number | boolean>;
  available: number;
  reserved: number;
  lowThreshold: number;
}

interface OrderRecord {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customer: { name: string; email: string };
  items: { sku: string; name: string; unit_price_cents: number; qty: number; line_total_cents: number }[];
  subtotal_cents: number;
  total_cents: number;
  timeline: { status: string; at: string; note: string | null }[];
  createdAt: string;
}

let products = new Map<string, ProductRecord>();
let variants = new Map<string, VariantRecord>();
let ledger: StockLedgerEntry[] = [];
let orders = new Map<string, OrderRecord>();
let stockConflicts = 0;
let seq = { product: 0, variant: 0, ledger: 0, order: 0 };

const ISO = (offsetDays: number, hour = 10): string => {
  const d = new Date('2026-06-21T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - offsetDays);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

const CUSTOMERS = [
  { name: 'Mara Okonkwo', email: 'mara@example.com' },
  { name: 'Devin Park', email: 'devin@example.com' },
  { name: 'Lena Fischer', email: 'lena@example.com' },
  { name: 'Sora Tanaka', email: 'sora@example.com' },
  { name: 'Ravi Mehta', email: 'ravi@example.com' },
];

function pushLedger(variantId: string, kind: LedgerKind, delta: number, availableAfter: number, orderId: string | null, note: string | null, at: string): void {
  ledger.push({
    id: `sl_${String((seq.ledger += 1)).padStart(3, '0')}`,
    variant_id: variantId,
    kind,
    delta,
    available_after: availableAfter,
    order_id: orderId,
    note,
    created_at: at,
  });
}

function seed(): void {
  products = new Map();
  variants = new Map();
  ledger = [];
  orders = new Map();
  stockConflicts = 3; // seeded oversell attempts the saga rejected
  seq = { product: 0, variant: 0, ledger: 0, order: 0 };

  mockProducts.forEach((product, pIndex) => {
    const productId = `p_${String((seq.product += 1)).padStart(2, '0')}`;
    const variantIds: string[] = [];
    product.variants.forEach((v, vIndex) => {
      const variantId = `vr_${String((seq.variant += 1)).padStart(2, '0')}`;
      const reserved = v.available > 0 ? (vIndex + pIndex) % 4 : 0;
      variants.set(variantId, {
        id: variantId,
        productId,
        sku: v.sku,
        name: v.name,
        price_cents: v.price_cents,
        attributes: v.attributes,
        available: v.available,
        reserved,
        lowThreshold: LOW_STOCK_THRESHOLD,
      });
      variantIds.push(variantId);
      // Seed an initial restock + (when reserved) a reservation, so the ledger
      // reads as a believable audit trail.
      pushLedger(variantId, 'restock', v.available + reserved, v.available + reserved, null, 'Initial stock', ISO(20, 9));
      if (reserved > 0) pushLedger(variantId, 'reserve', -reserved, v.available, `o_${vIndex}${pIndex}`, 'Checkout reservation', ISO(2, 11 + (vIndex % 6)));
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
      createdAt: product.createdAt,
      updatedAt: product.createdAt,
    });
  });

  // A handful of admin orders with customers + status timelines.
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
    const created = ISO(o.daysAgo, 9 + (i % 8));
    const timeline: OrderRecord['timeline'] = [{ status: 'pending', at: created, note: 'Order created, stock reserved' }];
    if (o.status !== 'pending') {
      timeline.push({ status: o.payment === 'succeeded' ? 'paid' : o.status, at: created, note: o.payment === 'succeeded' ? 'Payment confirmed (webhook)' : 'Payment failed' });
    }
    if (o.status === 'fulfilled') timeline.push({ status: 'fulfilled', at: created, note: 'Shipped' });
    if (o.status === 'cancelled') timeline.push({ status: 'cancelled', at: created, note: 'Stock unavailable at settlement — refunded' });
    orders.set(id, {
      id,
      status: o.status,
      paymentStatus: o.payment,
      customer: CUSTOMERS[i % CUSTOMERS.length],
      items,
      subtotal_cents: subtotal,
      total_cents: subtotal,
      timeline,
      createdAt: created,
    });
  });
}

seed();

/* ---- Projections ---- */

function toAdminVariant(v: VariantRecord): AdminVariant {
  return {
    id: v.id,
    sku: v.sku,
    name: v.name,
    price_cents: v.price_cents,
    currency: CURRENCY,
    attributes: v.attributes,
    available: v.available,
    reserved: v.reserved,
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
    price_min_cents: prices.length ? Math.min(...prices) : 0,
    price_max_cents: prices.length ? Math.max(...prices) : 0,
    currency: CURRENCY,
    total_available: vs.reduce((s, v) => s + v.available, 0),
    image: `/img/keyboards/${record.slug}.svg`,
    updated_at: record.updatedAt,
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
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function toInventoryRow(v: VariantRecord): InventoryRow {
  const product = products.get(v.productId);
  return {
    variant_id: v.id,
    sku: v.sku,
    product_name: product?.name ?? '—',
    variant_name: v.name,
    available: v.available,
    reserved: v.reserved,
    on_hand: v.available + v.reserved,
    low_stock_threshold: v.lowThreshold,
    is_low: v.available <= v.lowThreshold,
  };
}

function toOrderSummary(o: OrderRecord): AdminOrderSummary {
  return {
    id: o.id,
    status: o.status,
    total_cents: o.total_cents,
    currency: CURRENCY,
    item_count: o.items.reduce((s, it) => s + it.qty, 0),
    customer_email: o.customer.email,
    created_at: o.createdAt,
  };
}

/* ---- Validation (attributes against the type's attribute_schema) ---- */

export interface ValidationFailure {
  field: string;
  message: string;
}

export function validateAttributes(typeKey: string, attributes: Record<string, unknown>): ValidationFailure | null {
  const schema = ADMIN_ATTRIBUTE_SCHEMAS[typeKey];
  if (!schema) return { field: 'type', message: `Unknown product type "${typeKey}".` };
  for (const field of schema.fields) {
    const value = attributes[field.name];
    const missing = value === undefined || value === null || value === '';
    if (field.required && missing) return { field: field.name, message: `${field.label} is required.` };
    if (missing) continue;
    if (field.type === 'number' && typeof value !== 'number') return { field: field.name, message: `${field.label} must be a number.` };
    if (field.type === 'bool' && typeof value !== 'boolean') return { field: field.name, message: `${field.label} must be true or false.` };
    if (field.type === 'select' && field.options && !field.options.includes(String(value)))
      return { field: field.name, message: `${field.label} must be one of: ${field.options.join(', ')}.` };
  }
  return null;
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
  const [key, dir] = (query.sort ?? 'updated_at:desc').split(':');
  const factor = dir === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    switch (key) {
      case 'name':
        return a.name.localeCompare(b.name) * factor;
      case 'price':
        return (a.price_min_cents - b.price_min_cents) * factor;
      case 'stock':
        return (a.total_available - b.total_available) * factor;
      case 'status':
        return a.status.localeCompare(b.status) * factor;
      default:
        return a.updated_at.localeCompare(b.updated_at) * factor;
    }
  });
  return items;
}

export function getProductDetail(id: string): AdminProductDetail | null {
  const record = products.get(id);
  return record ? toDetail(record) : null;
}

export function listInventory(lowOnly: boolean): InventoryRow[] {
  let rows = [...variants.values()].map(toInventoryRow);
  if (lowOnly) rows = rows.filter((r) => r.is_low);
  return rows.sort((a, b) => a.available - b.available);
}

export function getLedger(variantId: string): StockLedgerEntry[] | null {
  if (!variants.has(variantId)) return null;
  return ledger
    .filter((e) => e.variant_id === variantId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
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
    status: o.status,
    currency: CURRENCY,
    subtotal_cents: o.subtotal_cents,
    total_cents: o.total_cents,
    customer: o.customer,
    payment: { provider: 'stripe', status: o.paymentStatus },
    items: o.items,
    timeline: o.timeline,
    created_at: o.createdAt,
  };
}

/* ---- Mutations ---- */

export function nextSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product';
  let slug = base;
  let n = 2;
  const taken = new Set([...products.values()].map((p) => p.slug));
  while (taken.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

export interface CreateProductInput {
  name: string;
  type: string;
  description: string;
  status: ProductStatus;
  attributes: Record<string, string | number | boolean>;
}

export function createProduct(input: CreateProductInput): AdminProductDetail {
  const id = `p_${String((seq.product += 1)).padStart(2, '0')}`;
  const now = new Date().toISOString();
  products.set(id, {
    id,
    slug: nextSlug(input.name),
    name: input.name,
    description: input.description,
    type: input.type,
    status: input.status,
    attributes: input.attributes,
    variantIds: [],
    createdAt: now,
    updatedAt: now,
  });
  return toDetail(products.get(id)!);
}

export function updateProduct(id: string, input: Partial<CreateProductInput>): AdminProductDetail | null {
  const record = products.get(id);
  if (!record) return null;
  Object.assign(record, {
    name: input.name ?? record.name,
    description: input.description ?? record.description,
    type: input.type ?? record.type,
    status: input.status ?? record.status,
    attributes: input.attributes ?? record.attributes,
    updatedAt: new Date().toISOString(),
  });
  return toDetail(record);
}

export function archiveProduct(id: string): AdminProductDetail | null {
  const record = products.get(id);
  if (!record) return null;
  record.status = 'archived';
  record.updatedAt = new Date().toISOString();
  return toDetail(record);
}

export interface CreateVariantInput {
  sku: string;
  name: string;
  price_cents: number;
  attributes: Record<string, string | number | boolean>;
  available: number;
}

export function skuExists(sku: string, exceptVariantId?: string): boolean {
  for (const v of variants.values()) if (v.sku === sku && v.id !== exceptVariantId) return true;
  return false;
}

export function createVariant(productId: string, input: CreateVariantInput): AdminProductDetail | null {
  const product = products.get(productId);
  if (!product) return null;
  const id = `vr_${String((seq.variant += 1)).padStart(2, '0')}`;
  variants.set(id, {
    id,
    productId,
    sku: input.sku,
    name: input.name,
    price_cents: input.price_cents,
    attributes: input.attributes,
    available: input.available,
    reserved: 0,
    lowThreshold: LOW_STOCK_THRESHOLD,
  });
  product.variantIds.push(id);
  product.updatedAt = new Date().toISOString();
  if (input.available > 0) pushLedger(id, 'restock', input.available, input.available, null, 'Variant created', new Date().toISOString());
  return toDetail(product);
}

export function updateVariant(variantId: string, input: Partial<CreateVariantInput>): AdminProductDetail | null {
  const v = variants.get(variantId);
  if (!v) return null;
  if (input.sku !== undefined) v.sku = input.sku;
  if (input.name !== undefined) v.name = input.name;
  if (input.price_cents !== undefined) v.price_cents = input.price_cents;
  if (input.attributes !== undefined) v.attributes = input.attributes;
  if (input.available !== undefined && input.available !== v.available) {
    const delta = input.available - v.available;
    v.available = input.available;
    pushLedger(variantId, delta >= 0 ? 'restock' : 'commit', delta, v.available, null, 'Manual adjustment', new Date().toISOString());
  }
  const product = products.get(v.productId);
  if (product) product.updatedAt = new Date().toISOString();
  return product ? toDetail(product) : null;
}

export function restock(variantId: string, qty: number): InventoryRow | null {
  const v = variants.get(variantId);
  if (!v) return null;
  v.available += qty;
  pushLedger(variantId, 'restock', qty, v.available, null, 'Manual restock', new Date().toISOString());
  const product = products.get(v.productId);
  if (product) product.updatedAt = new Date().toISOString();
  return toInventoryRow(v);
}

export function variantById(id: string): VariantRecord | undefined {
  return variants.get(id);
}

/* ---- Dashboard ---- */

export function getDashboard(): DashboardData {
  const orderList = [...orders.values()];
  const paid = orderList.filter((o) => o.status === 'paid' || o.status === 'fulfilled');
  const revenue = paid.reduce((s, o) => s + o.total_cents, 0);
  const inventory = [...variants.values()].map(toInventoryRow);
  const low = inventory.filter((r) => r.is_low);

  // 14-day order trend (synthetic but stable: derived from order createdAt buckets).
  const trend = Array.from({ length: 14 }).map((_, i) => {
    const day = 13 - i;
    const date = ISO(day, 0).slice(0, 10);
    const dayOrders = orderList.filter((o) => o.createdAt.slice(0, 10) === date);
    const seedN = (day * 7 + 3) % 9; // smooth-ish baseline so the chart isn't flat
    return {
      date,
      orders: dayOrders.length + seedN,
      revenue_cents: dayOrders.reduce((s, o) => s + o.total_cents, 0) + seedN * 9900,
    };
  });

  const sellerCounts = new Map<string, number>();
  for (const o of orderList) {
    for (const it of o.items) sellerCounts.set(it.name, (sellerCounts.get(it.name) ?? 0) + it.qty);
  }
  const topSellers = [...sellerCounts.entries()]
    .map(([name, units]) => ({ name, units }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);

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
