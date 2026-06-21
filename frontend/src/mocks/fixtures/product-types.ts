import type { ProductType } from '@/services/types';
import { mockProducts } from './products';

const BASE_TYPES: ReadonlyArray<Pick<ProductType, 'key' | 'name'>> = [
  { key: 'keyboard', name: 'Keyboards' },
  { key: 'keycaps', name: 'Keycaps' },
  { key: 'switches', name: 'Switches' },
];

export const mockProductTypes: ProductType[] = BASE_TYPES.map((type) => ({
  ...type,
  product_count: mockProducts.filter((product) => product.type === type.key).length,
}));
