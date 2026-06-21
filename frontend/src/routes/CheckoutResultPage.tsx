import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOrder } from '@/hooks/useOrders';
import { queryKeys } from '@/services/query-client';
import { ApiError } from '@/services/api';
import { ErrorState } from '@/components/ui/ErrorState';
import { buttonClasses } from '@/components/ui/Button';
import type { OrderDetail } from '@/services/types';
import { formatPrice } from '@/lib/format';

function Spinner() {
  return (
    <svg className="animate-spin text-interactive" viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeOpacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}

function ProcessingView() {
  return (
    <>
      <Spinner />
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Confirming your payment</h1>
      <p className="text-ink-soft">
        We’re waiting for your payment to be confirmed — this can take a moment. Please don’t close
        this page.
      </p>
      <p className="label-mono text-ink-faint">Status: pending</p>
    </>
  );
}

function PaidView({ order }: { order: OrderDetail }) {
  return (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-stock-in-bg text-stock-in-ink">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m20 6-11 11-5-5" />
        </svg>
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Payment confirmed</h1>
      <p className="text-ink-soft">Thanks — your order is placed.</p>
      <p className="label-mono text-ink-faint">
        Order {order.id} · {formatPrice(order.total_cents, order.currency)}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link to={`/orders/${order.id}`} className={buttonClasses('primary', 'md')}>
          View order
        </Link>
        <Link to="/" className={buttonClasses('secondary', 'md')}>
          Continue shopping
        </Link>
      </div>
    </>
  );
}

function FailedView() {
  return (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-stock-out-bg text-stock-out-ink">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Payment didn’t go through</h1>
      <p className="text-ink-soft">
        Your card wasn’t charged. You can try again — your cart has been kept.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link to="/checkout" className={buttonClasses('primary', 'md')}>
          Try again
        </Link>
        <Link to="/cart" className={buttonClasses('secondary', 'md')}>
          Review cart
        </Link>
      </div>
    </>
  );
}

export function CheckoutResultPage() {
  const [params] = useSearchParams();
  const orderId = params.get('order_id') ?? '';
  const orderQuery = useOrder(orderId, { poll: true });
  const order = orderQuery.data;
  const queryClient = useQueryClient();

  // Once the order is paid, the server cart is consumed — refetch so the cart
  // badge resets (covers the live flow where the webhook clears it).
  const isPaid = order?.status === 'paid' || order?.status === 'fulfilled';
  useEffect(() => {
    if (isPaid) void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
  }, [isPaid, queryClient]);

  if (!orderId) {
    return (
      <div className="container-page py-20">
        <ErrorState error={new Error('No order reference was provided.')} title="No order to show" />
      </div>
    );
  }

  if (orderQuery.isError) {
    const code = orderQuery.error instanceof ApiError ? orderQuery.error.code : null;
    return (
      <div className="container-page py-20">
        <ErrorState
          error={orderQuery.error}
          onRetry={() => void orderQuery.refetch()}
          title={code === 'not_found' ? 'Order not found' : 'Something went wrong'}
        />
      </div>
    );
  }

  const status = order?.status ?? 'pending';
  const processing = orderQuery.isLoading || status === 'pending';
  const paid = status === 'paid' || status === 'fulfilled';

  return (
    <div className="container-page py-16">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center" aria-live="polite">
        {processing ? <ProcessingView /> : paid && order ? <PaidView order={order} /> : <FailedView />}
      </div>
    </div>
  );
}
