import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { OrderStatusBadge } from '@/components/order/OrderStatusBadge';
import { useAdminOrders } from '@/hooks/admin/useAdminOrders';
import { formatDate, formatPrice } from '@/lib/format';
import { ORDER_STATUSES } from '@/services/types';
import type { AdminOrderSummary } from '@/services/admin-types';

export function AdminOrdersPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const query = useMemo(() => ({ status: status || undefined, page, limit: 12 }), [status, page]);
  const { data, isLoading, isError, error, refetch } = useAdminOrders(query);
  const pageCount = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.limit)) : 1;

  const columns: Column<AdminOrderSummary>[] = [
    { key: 'id', header: 'Order', cell: (o) => <span className="font-mono text-ink">{o.id}</span> },
    { key: 'customer', header: 'Customer', cell: (o) => <span className="truncate text-ink-soft">{o.customer_email}</span> },
    { key: 'items', header: 'Items', align: 'right', hideBelow: 'sm', cell: (o) => <span className="font-mono tabular-nums text-ink-soft">{o.item_count}</span> },
    { key: 'total', header: 'Total', align: 'right', cell: (o) => <span className="font-mono tabular-nums text-ink">{formatPrice(o.total_cents, o.currency)}</span> },
    { key: 'status', header: 'Status', cell: (o) => <OrderStatusBadge status={o.status} /> },
    { key: 'created', header: 'Placed', hideBelow: 'md', cell: (o) => <span className="whitespace-nowrap text-ink-soft">{formatDate(o.created_at)}</span> },
  ];

  return (
    <>
      <AdminPageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Orders' }]}
        title="Orders"
        description="Every order, with snapshots and status history."
        actions={
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="w-auto"
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        }
      />

      <DataTable
        caption="Orders"
        columns={columns}
        rows={data?.orders ?? []}
        rowKey={(o) => o.id}
        onRowClick={(o) => navigate(`/admin/orders/${o.id}`)}
        rowLabel={(o) => `Open order ${o.id} for ${o.customer_email}`}
        loading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
      />

      <Pagination className="mt-5" page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  );
}
