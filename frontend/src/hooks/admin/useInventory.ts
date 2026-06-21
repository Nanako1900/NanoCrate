import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getInventory, getStockLedger, restock } from '@/services/admin';
import { adminKeys } from './keys';

export function useInventory(lowOnly = false) {
  return useQuery({
    queryKey: adminKeys.inventory(lowOnly),
    queryFn: ({ signal }) => getInventory(lowOnly, signal),
  });
}

export function useStockLedger(variantId: string) {
  return useQuery({
    queryKey: adminKeys.ledger(variantId),
    queryFn: ({ signal }) => getStockLedger(variantId, signal),
    enabled: Boolean(variantId),
  });
}

export function useRestock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { variantId: string; qty: number }) => restock(vars.variantId, vars.qty),
    onSuccess: (_row, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      void qc.invalidateQueries({ queryKey: adminKeys.ledger(vars.variantId) });
      void qc.invalidateQueries({ queryKey: adminKeys.dashboard });
    },
  });
}
