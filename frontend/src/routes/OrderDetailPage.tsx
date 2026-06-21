import { Link, useParams } from 'react-router-dom';
import { useOrder } from '@/hooks/useOrders';
import { ApiError } from '@/services/api';
import { OrderStatusBadge } from '@/components/order/OrderStatusBadge';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { NotFoundPage } from './NotFoundPage';
import { formatAttributeKey, formatDate, formatPrice } from '@/lib/format';

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const orderQuery = useOrder(id);
  const order = orderQuery.data;

  if (orderQuery.isLoading) {
    return (
      <div className="container-page py-8 lg:py-12" role="status" aria-label="Loading order">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-6 h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (orderQuery.isError) {
    const code = orderQuery.error instanceof ApiError ? orderQuery.error.code : null;
    if (code === 'not_found') return <NotFoundPage title="Order not found" />;
    return (
      <div className="container-page py-16">
        <ErrorState error={orderQuery.error} onRetry={() => void orderQuery.refetch()} />
      </div>
    );
  }

  if (!order) return <NotFoundPage title="Order not found" />;

  return (
    <article className="container-page py-8 lg:py-12">
      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center text-sm text-ink-soft">
        <Link to="/orders" className="rounded-sm transition-colors hover:text-ink">
          Orders
        </Link>
        <span className="px-2 text-ink-faint" aria-hidden="true">/</span>
        <span className="font-mono text-ink" aria-current="page">{order.id}</span>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-ink">{order.id}</h1>
          <p className="label-mono mt-1">Placed {formatDate(order.created_at)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
        <section aria-label="Items" className="rounded-lg border border-line bg-surface px-5 shadow-sm">
          <ul className="divide-y divide-line">
            {order.items.map((item, index) => (
              <li key={`${item.sku}-${index}`} className="flex items-start justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="font-medium leading-snug text-ink">{item.name}</p>
                  <p className="label-mono mt-1">
                    {item.sku} · ×{item.qty} · {formatPrice(item.unit_price_cents, order.currency)} each
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm tabular-nums text-ink">
                  {formatPrice(item.line_total_cents, order.currency)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-soft">Subtotal</dt>
                <dd className="font-mono tabular-nums text-ink">{formatPrice(order.subtotal_cents, order.currency)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <dt className="font-medium text-ink">Total</dt>
                <dd className="font-mono text-lg font-semibold tabular-nums text-ink">
                  {formatPrice(order.total_cents, order.currency)}
                </dd>
              </div>
            </dl>
          </div>
          <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
            <p className="label-mono">Payment</p>
            <p className="mt-2 text-sm text-ink">
              {formatAttributeKey(order.payment.provider)} ·{' '}
              <span className="font-mono">{order.payment.status.replace(/_/g, ' ')}</span>
            </p>
          </div>
        </aside>
      </div>
    </article>
  );
}
