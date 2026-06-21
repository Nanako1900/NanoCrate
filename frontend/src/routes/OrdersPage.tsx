import { Link, useSearchParams } from 'react-router-dom';
import { useOrders } from '@/hooks/useOrders';
import { OrderStatusBadge } from '@/components/order/OrderStatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { buttonClasses } from '@/components/ui/Button';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatDate, formatPrice, pluralize } from '@/lib/format';

const PAGE_SIZE = 20;

export function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const ordersQuery = useOrders(page, PAGE_SIZE);

  const orders = ordersQuery.data?.orders ?? [];
  const meta = ordersQuery.data?.meta;
  const pageCount = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;

  function setPage(next: number) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next <= 1) params.delete('page');
      else params.set('page', String(next));
      return params;
    });
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="container-page py-8 lg:py-12">
      <PageHeader eyebrow="Account" title="Orders" />

      {ordersQuery.isLoading ? (
        <ul className="mt-8 flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <li key={index}>
              <Skeleton className="h-20 w-full rounded-lg" />
            </li>
          ))}
        </ul>
      ) : ordersQuery.isError ? (
        <div className="mt-10">
          <ErrorState error={ordersQuery.error} onRetry={() => void ordersQuery.refetch()} />
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            eyebrow="No orders"
            title="No orders yet"
            description="Once you check out, your orders show up here."
            action={
              <Link to="/" className={buttonClasses('primary', 'sm')}>
                Browse keyboards
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          <ul className="flex flex-col gap-3">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/orders/${order.id}`}
                  className="group flex items-center justify-between gap-4 rounded-lg border border-line bg-surface px-5 py-4 shadow-sm transition-transform duration-150 ease-out will-change-transform hover:-translate-y-0.5 hover:border-line-strong"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium text-ink">{order.id}</p>
                    <p className="label-mono mt-1">
                      {formatDate(order.created_at)} · {order.item_count}{' '}
                      {pluralize(order.item_count, 'item')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <OrderStatusBadge status={order.status} />
                    <span className="font-mono text-sm font-medium tabular-nums text-ink">
                      {formatPrice(order.total_cents, order.currency)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
