import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getAdminOrder, getAdminOrders } from '@/services/admin';
import { adminKeys } from './keys';

export function useAdminOrders(query: { status?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: adminKeys.orders(query),
    queryFn: ({ signal }) => getAdminOrders(query, signal),
    placeholderData: keepPreviousData,
  });
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: adminKeys.order(id),
    queryFn: ({ signal }) => getAdminOrder(id, signal),
    enabled: Boolean(id),
  });
}
