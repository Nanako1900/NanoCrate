import { describe, expect, it } from 'vitest';
import { getProduct, getProductTypes, getProducts, searchProducts } from './api';

/**
 * Integration test for the contract layer: exercises api.ts against the MSW
 * handlers (started in src/test/setup.ts), validating envelope unwrapping,
 * Zod parsing, pagination meta, and error normalization end to end.
 */
describe('api client', () => {
  it('lists the first page of products with pagination meta', async () => {
    const result = await getProducts({});
    expect(result.items).toHaveLength(9);
    expect(result.meta.total).toBe(12);
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(9);
  });

  it('filters products by type', async () => {
    const result = await getProducts({ type: 'switches' });
    expect(result.meta.total).toBe(2);
    expect(result.items.every((item) => item.type === 'switches')).toBe(true);
  });

  it('returns a second page when paginating', async () => {
    const result = await getProducts({ page: 2, limit: 9 });
    expect(result.items).toHaveLength(3);
    expect(result.meta.page).toBe(2);
  });

  it('returns product detail with variants and availability', async () => {
    const product = await getProduct('nano75');
    expect(product.slug).toBe('nano75');
    expect(product.variants.length).toBeGreaterThan(0);
    expect(product.variants[0]).toHaveProperty('available');
  });

  it('normalizes an unknown slug into ApiError(not_found)', async () => {
    await expect(getProduct('does-not-exist')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lists product types', async () => {
    const types = await getProductTypes();
    expect(types.map((type) => type.key)).toContain('keyboard');
  });

  it('returns ranked search hits within the limit', async () => {
    const result = await searchProducts('quiet office full-size', 5);
    expect(result.hits.length).toBeLessThanOrEqual(5);
    expect(result.hits[0]).toHaveProperty('slug');
  });
});
