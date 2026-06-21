/** Stable query keys for the admin surface (namespaced under "admin"). */
export const adminKeys = {
  all: ['admin'] as const,
  dashboard: ['admin', 'dashboard'] as const,
  productTypes: ['admin', 'product-types'] as const,
  productType: (key: string) => ['admin', 'product-type', key] as const,
  products: (query: object) => ['admin', 'products', query] as const,
  product: (id: string) => ['admin', 'product', id] as const,
  inventory: (lowOnly: boolean) => ['admin', 'inventory', { lowOnly }] as const,
  ledger: (variantId: string) => ['admin', 'ledger', variantId] as const,
  orders: (query: object) => ['admin', 'orders', query] as const,
  order: (id: string) => ['admin', 'order', id] as const,
};
