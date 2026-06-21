import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  archiveProduct,
  createProduct,
  createVariant,
  getAdminProductType,
  getAdminProducts,
  getDashboard,
  getInventory,
  getStockLedger,
  restock,
} from './admin';
import { setAuthToken, clearAuthToken } from './auth-token';
import { MOCK_ADMIN, MOCK_CUSTOMER } from '@/auth/mock-session';
import { __resetAdminStore } from '@/mocks/admin/store';

beforeEach(() => {
  __resetAdminStore();
  setAuthToken(MOCK_ADMIN.token);
});
afterEach(() => clearAuthToken());

describe('admin RBAC (proposed §9.5)', () => {
  it('rejects with unauthorized when no token is present', async () => {
    clearAuthToken();
    await expect(getDashboard()).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('rejects a non-admin token with forbidden', async () => {
    setAuthToken(MOCK_CUSTOMER.token);
    await expect(getAdminProducts()).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('admin products', () => {
  it('lists seeded products with pagination meta', async () => {
    const result = await getAdminProducts({ limit: 5 });
    expect(result.items.length).toBe(5);
    expect(result.meta.total).toBeGreaterThanOrEqual(12);
  });

  it('rejects a product whose required attribute is missing (validation_failed)', async () => {
    // keyboard requires `layout`; omit it.
    await expect(
      createProduct({ name: 'Test Board', type: 'keyboard', description: '', status: 'draft', attributes: { mount: 'gasket', connection: 'wired' } }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('creates a valid product and surfaces it in the list', async () => {
    const created = await createProduct({
      name: 'Nano Test',
      type: 'keyboard',
      description: 'A test board.',
      status: 'active',
      attributes: { layout: '75%', mount: 'gasket', connection: 'wired', hot_swappable: true },
    });
    expect(created.id).toMatch(/^p_/);
    expect(created.slug).toBe('nano-test');

    const list = await getAdminProducts({ q: 'Nano Test' });
    expect(list.items.some((p) => p.id === created.id)).toBe(true);
  });

  it('rejects a duplicate SKU on variant create (conflict)', async () => {
    const created = await createProduct({
      name: 'Variant Host',
      type: 'switches',
      description: '',
      status: 'active',
      attributes: { type: 'linear', actuation_g: 45, pack: 70 },
    });
    await expect(
      createVariant(created.id, { sku: 'SW-RED-70', name: 'dup', price_cents: 1000, attributes: {}, available: 5 }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('archives a product', async () => {
    const { items } = await getAdminProducts({ limit: 1 });
    const archived = await archiveProduct(items[0].id);
    expect(archived.status).toBe('archived');
  });
});

describe('admin inventory + ledger', () => {
  it('restock increases available and appends a ledger entry', async () => {
    const inv = await getInventory();
    const target = inv[0];
    const before = target.available;
    const row = await restock(target.variant_id, 10);
    expect(row.available).toBe(before + 10);

    const ledger = await getStockLedger(target.variant_id);
    expect(ledger[0].kind).toBe('restock');
    expect(ledger[0].delta).toBe(10);
    expect(ledger[0].available_after).toBe(before + 10);
  });

  it('low-only filter returns only low-stock rows', async () => {
    const low = await getInventory(true);
    expect(low.every((r) => r.is_low)).toBe(true);
  });
});

describe('admin dashboard', () => {
  it('returns KPIs including the stock-conflict count', async () => {
    const data = await getDashboard();
    expect(data.kpis.stock_conflict_count).toBeGreaterThanOrEqual(0);
    expect(data.recent_orders.length).toBeGreaterThan(0);
    expect(data.order_trend.length).toBe(14);
    expect(Array.isArray(data.top_sellers)).toBe(true);
  });

  it('attribute_schema for keyboard exposes a required select field', async () => {
    const type = await getAdminProductType('keyboard');
    const layout = type.attribute_schema.fields.find((f) => f.name === 'layout');
    expect(layout?.type).toBe('select');
    expect(layout?.required).toBe(true);
  });
});
