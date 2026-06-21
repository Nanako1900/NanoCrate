import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { addCartItem, getCart, removeCartItem, updateCartItem } from '@/services/api';
import { queryKeys } from '@/services/query-client';
import type { Cart } from '@/services/types';
import {
  optimisticAdd,
  optimisticRemove,
  optimisticUpdate,
  type CartItemPreview,
} from '@/lib/cart';

interface MutationContext {
  previous: Cart | undefined;
}

/** Snapshot + optimistic write shared by every cart mutation. */
async function beginOptimistic(qc: QueryClient, next: (prev: Cart | undefined) => Cart): Promise<MutationContext> {
  await qc.cancelQueries({ queryKey: queryKeys.cart });
  const previous = qc.getQueryData<Cart>(queryKeys.cart);
  qc.setQueryData<Cart>(queryKeys.cart, next(previous));
  return { previous };
}

function rollback(qc: QueryClient, context: MutationContext | undefined) {
  // Restore the snapshot unconditionally (undefined clears a phantom optimistic
  // line from a first-ever add), then refetch the authoritative server cart.
  qc.setQueryData(queryKeys.cart, context?.previous);
  void qc.invalidateQueries({ queryKey: queryKeys.cart });
}

export function useCart() {
  return useQuery({
    queryKey: queryKeys.cart,
    queryFn: ({ signal }) => getCart(signal),
  });
}

export interface AddToCartVars {
  variant_id: string;
  qty: number;
  preview: CartItemPreview;
}

export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation<Cart, unknown, AddToCartVars, MutationContext>({
    mutationFn: (vars) => addCartItem({ variant_id: vars.variant_id, qty: vars.qty }),
    onMutate: (vars) => beginOptimistic(qc, (prev) => optimisticAdd(prev, vars.preview, vars.qty)),
    onError: (_error, _vars, context) => rollback(qc, context),
    onSuccess: (cart) => qc.setQueryData(queryKeys.cart, cart),
  });
}

export interface UpdateCartItemVars {
  itemId: string;
  qty: number;
}

export function useUpdateCartItem() {
  const qc = useQueryClient();
  return useMutation<Cart, unknown, UpdateCartItemVars, MutationContext>({
    mutationFn: (vars) => updateCartItem(vars.itemId, vars.qty),
    onMutate: (vars) => beginOptimistic(qc, (prev) => optimisticUpdate(prev, vars.itemId, vars.qty)),
    onError: (_error, _vars, context) => rollback(qc, context),
    onSuccess: (cart) => qc.setQueryData(queryKeys.cart, cart),
  });
}

export function useRemoveCartItem() {
  const qc = useQueryClient();
  return useMutation<Cart, unknown, { itemId: string }, MutationContext>({
    mutationFn: (vars) => removeCartItem(vars.itemId),
    onMutate: (vars) => beginOptimistic(qc, (prev) => optimisticRemove(prev, vars.itemId)),
    onError: (_error, _vars, context) => rollback(qc, context),
    onSuccess: (cart) => qc.setQueryData(queryKeys.cart, cart),
  });
}
