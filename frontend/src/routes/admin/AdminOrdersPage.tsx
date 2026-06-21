import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { AdminOrderStatusBadge, ORDER_STATUS_LABEL } from '@/components/admin/status';
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
    { key: 'id', header: '订单', cell: (o) => <span className="font-mono text-ink">{o.id}</span> },
    { key: 'customer', header: '客户', cell: (o) => <span className="truncate font-mono text-2xs text-ink-soft">{o.user_id}</span> },
    { key: 'items', header: '件数', align: 'right', hideBelow: 'sm', cell: (o) => <span className="font-mono tabular-nums text-ink-soft">{o.item_count}</span> },
    { key: 'total', header: '金额', align: 'right', cell: (o) => <span className="font-mono tabular-nums text-ink">{formatPrice(o.total_cents, o.currency)}</span> },
    { key: 'status', header: '状态', cell: (o) => <AdminOrderStatusBadge status={o.status} /> },
    { key: 'created', header: '下单时间', hideBelow: 'md', cell: (o) => <span className="whitespace-nowrap text-ink-soft">{formatDate(o.created_at)}</span> },
  ];

  return (
    <>
      <AdminPageHeader
        breadcrumbs={[{ label: '后台', to: '/admin' }, { label: '订单' }]}
        title="订单"
        description="全部订单,含下单快照与状态历史。"
        actions={
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="按状态筛选"
            className="w-auto"
          >
            <option value="">全部状态</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        }
      />

      <DataTable
        caption="订单"
        columns={columns}
        rows={data?.orders ?? []}
        rowKey={(o) => o.id}
        onRowClick={(o) => navigate(`/admin/orders/${o.id}`)}
        rowLabel={(o) => `打开订单 ${o.id}`}
        loading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
      />

      <Pagination className="mt-5" page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  );
}
