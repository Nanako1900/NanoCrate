import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveProduct,
  createProduct,
  createVariant,
  getAdminProduct,
  getAdminProducts,
  getAdminProductType,
  getAdminProductTypes,
  updateProduct,
  updateVariant,
  type AdminProductQuery,
} from '@/services/admin';
import type { AdminProductDetail, AdminVariant, ProductWriteInput, VariantWriteInput } from '@/services/admin-types';
import { adminKeys } from './keys';

export function useAdminProducts(query: AdminProductQuery) {
  return useQuery({
    queryKey: adminKeys.products(query),
    queryFn: ({ signal }) => getAdminProducts(query, signal),
    placeholderData: keepPreviousData,
  });
}

export function useAdminProduct(id: string) {
  return useQuery({
    queryKey: adminKeys.product(id),
    queryFn: ({ signal }) => getAdminProduct(id, signal),
    enabled: Boolean(id),
  });
}

export function useAdminProductTypes() {
  return useQuery({
    queryKey: adminKeys.productTypes,
    queryFn: ({ signal }) => getAdminProductTypes(signal),
    staleTime: 5 * 60_000, // schemas rarely change within a session
  });
}

export function useAdminProductType(key: string) {
  return useQuery({
    queryKey: adminKeys.productType(key),
    queryFn: ({ signal }) => getAdminProductType(key, signal),
    enabled: Boolean(key),
    staleTime: 5 * 60_000,
  });
}

/** Invalidate every product list + the affected detail after a write. */
function useProductWriteCallbacks() {
  const qc = useQueryClient();
  return (detail: AdminProductDetail) => {
    qc.setQueryData(adminKeys.product(detail.id), detail);
    void qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'inventory'] });
    void qc.invalidateQueries({ queryKey: adminKeys.dashboard });
  };
}

export function useCreateProduct() {
  const onWritten = useProductWriteCallbacks();
  return useMutation({
    mutationFn: (input: ProductWriteInput) => createProduct(input),
    onSuccess: onWritten,
  });
}

export function useUpdateProduct(id: string) {
  const onWritten = useProductWriteCallbacks();
  return useMutation({
    mutationFn: (input: Partial<ProductWriteInput>) => updateProduct(id, input),
    onSuccess: onWritten,
  });
}

export function useArchiveProduct() {
  const onWritten = useProductWriteCallbacks();
  return useMutation({
    mutationFn: (id: string) => archiveProduct(id),
    onSuccess: onWritten,
  });
}

/** Variant writes return the variant (§9.5) — invalidate the parent product. */
function useVariantWriteCallbacks() {
  const qc = useQueryClient();
  return (variant: AdminVariant) => {
    if (variant.product_id) void qc.invalidateQueries({ queryKey: adminKeys.product(variant.product_id) });
    void qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'inventory'] });
    void qc.invalidateQueries({ queryKey: adminKeys.dashboard });
  };
}

export function useCreateVariant(productId: string) {
  const onWritten = useVariantWriteCallbacks();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VariantWriteInput) => createVariant(productId, input),
    onSuccess: (variant) => {
      // createVariant's response omits product_id in some cases; ensure the
      // owning product is refreshed regardless.
      void qc.invalidateQueries({ queryKey: adminKeys.product(productId) });
      onWritten(variant);
    },
  });
}

export function useUpdateVariant() {
  const onWritten = useVariantWriteCallbacks();
  return useMutation({
    mutationFn: (vars: { variantId: string; input: Partial<VariantWriteInput> }) =>
      updateVariant(vars.variantId, vars.input),
    onSuccess: onWritten,
  });
}
