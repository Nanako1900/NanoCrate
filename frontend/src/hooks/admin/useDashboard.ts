import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '@/services/admin';
import { adminKeys } from './keys';

export function useDashboard() {
  return useQuery({
    queryKey: adminKeys.dashboard,
    queryFn: ({ signal }) => getDashboard(signal),
  });
}
