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
import { ApiError } from './api';
import { setAuthToken, clearAuthToken } from './auth-token';
import { MOCK_ADMIN, MOCK_CUSTOMER } from '@/auth/mock-session';
import { __resetAdminStore } from '@/mocks/admin/store';

beforeEach(() => {
  __resetAdminStore();
  setAuthToken(MOCK_ADMIN.token);
});
afterEach(() => clearAuthToken());

describe('admin RBAC (§9.5)', () => {
  it('rejects with unauthorized when no token is present', async () => {
    clearAuthToken();
    await expect(getDashboard()).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('rejects a non-admin token with forbidden', async () => {
    setAuthToken(MOCK_CUSTOMER.token);
    await expect(getAdminProducts()).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('admin products (§9.5 shapes)', () => {
  it('lists products with price_range_cents + pagination meta', async () => {
    const result = await getAdminProducts({ limit: 5 });
    expect(result.items.length).toBe(5);
    expect(result.items[0].price_range_cents).toHaveProperty('min');
    expect(result.meta.total).toBeGreaterThanOrEqual(12);
  });

  it('validation_failed locates the bad field in error.details[]', async () => {
    // keyboard requires `layout`; omit it.
    try {
      await createProduct({ name: 'Test Board', type: 'keyboard', description: '', status: 'draft', attributes: { mount: 'gasket', connection: 'wired' } });
      throw new Error('expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.code).toBe('validation_failed');
      expect(err.details.some((d) => d.field === 'layout')).toBe(true);
    }
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

  it('variant create returns the variant and rejects a duplicate SKU', async () => {
    const created = await createProduct({
      name: 'Variant Host',
      type: 'switches',
      description: '',
      status: 'active',
      attributes: { type: 'linear', actuation_g: 45, pack: 70 },
    });
    const variant = await createVariant(created.id, { sku: 'VH-1', name: 'v', price_cents: 1000, attributes: {}, available: 5 });
    expect(variant.id).toMatch(/^v_/);
    expect(variant.product_id).toBe(created.id);

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

describe('admin inventory + ledger (§9.5)', () => {
  it('restock returns {variant_id,available,reserved} and writes a two-delta ledger entry', async () => {
    const inv = await getInventory();
    const target = inv.rows[0];
    const before = target.available;
    const result = await restock(target.variant_id, 10);
    expect(result.variant_id).toBe(target.variant_id);
    expect(result.available).toBe(before + 10);

    const ledger = await getStockLedger(target.variant_id);
    expect(ledger.entries[0].kind).toBe('restock');
    expect(ledger.entries[0].delta_available).toBe(10);
    expect(ledger.entries[0].delta_reserved).toBe(0);
    expect(typeof ledger.entries[0].id).toBe('number');
  });

  it('low filter returns only rows at/below the threshold', async () => {
    const low = await getInventory({ low: true, threshold: 5 });
    expect(low.rows.every((r) => r.available <= 5)).toBe(true);
  });
});

describe('admin dashboard + schema', () => {
  it('returns KPIs including the stock-conflict count', async () => {
    const data = await getDashboard();
    expect(data.kpis.stock_conflict_count).toBeGreaterThanOrEqual(0);
    expect(data.recent_orders[0]).toHaveProperty('user_id');
    expect(data.order_trend.length).toBe(14);
  });

  it('attribute_schema for keyboard exposes a required select field', async () => {
    const type = await getAdminProductType('keyboard');
    const layout = type.attribute_schema.fields.find((f) => f.name === 'layout');
    expect(layout?.type).toBe('select');
    expect(layout?.required).toBe(true);
  });
});
