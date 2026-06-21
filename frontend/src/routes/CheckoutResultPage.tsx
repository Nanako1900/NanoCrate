import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOrder } from '@/hooks/useOrders';
import { queryKeys } from '@/services/query-client';
import { ApiError } from '@/services/api';
import { ErrorState } from '@/components/ui/ErrorState';
import { buttonClasses } from '@/components/ui/Button';
import type { OrderDetail } from '@/services/types';
import { formatPrice } from '@/lib/format';

type HeadingRef = RefObject<HTMLHeadingElement>;

const headingClass = 'text-2xl font-semibold tracking-tight text-ink outline-none';

function Spinner() {
  return (
    <svg className="animate-spin text-interactive" viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeOpacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}

function StatusIcon({ tone, children }: { tone: 'in' | 'out' | 'low'; children: ReactNode }) {
  const palette =
    tone === 'in'
      ? 'bg-stock-in-bg text-stock-in-ink'
      : tone === 'low'
        ? 'bg-stock-low-bg text-stock-low-ink'
        : 'bg-stock-out-bg text-stock-out-ink';
  return <span className={`flex h-12 w-12 items-center justify-center rounded-full ${palette}`}>{children}</span>;
}

function ProcessingView({ headingRef }: { headingRef: HeadingRef }) {
  return (
    <>
      <Spinner />
      <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
        Confirming your payment
      </h1>
      <p className="text-ink-soft">
        We’re waiting for your payment to be confirmed — this can take a moment. Please don’t close
        this page.
      </p>
    </>
  );
}

/** F9: polling gave up while still pending — let the user move on, not spin forever. */
function ProcessingTimeoutView({ headingRef, orderId }: { headingRef: HeadingRef; orderId: string }) {
  return (
    <>
      <StatusIcon tone="low">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </StatusIcon>
      <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
        Still processing
      </h1>
      <p className="text-ink-soft">
        Your payment is taking longer than usual to confirm. It’s safe to leave this page — the
        order will finish on its own and you can track it from your orders.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link to="/orders" className={buttonClasses('primary', 'md')}>
          Go to My Orders
        </Link>
        <Link to={`/orders/${orderId}`} className={buttonClasses('secondary', 'md')}>
          View this order
        </Link>
      </div>
    </>
  );
}

function PaidView({ order, headingRef }: { order: OrderDetail; headingRef: HeadingRef }) {
  return (
    <>
      <StatusIcon tone="in">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m20 6-11 11-5-5" />
        </svg>
      </StatusIcon>
      <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
        Payment confirmed
      </h1>
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

function FailedView({ headingRef }: { headingRef: HeadingRef }) {
  return (
    <>
      <StatusIcon tone="out">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </StatusIcon>
      <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
        Payment didn’t go through
      </h1>
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

/** F4: a cancelled order is NOT a failed payment — distinct copy + a link to detail. */
function CancelledView({ orderId, headingRef }: { orderId: string; headingRef: HeadingRef }) {
  return (
    <>
      <StatusIcon tone="out">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.9 4.9 19 19" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </StatusIcon>
      <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
        Order cancelled
      </h1>
      <p className="text-ink-soft">
        This order was cancelled — an item sold out before payment could be confirmed, so any
        authorized amount is released. Nothing was charged.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link to={`/orders/${orderId}`} className={buttonClasses('primary', 'md')}>
          View order
        </Link>
        <Link to="/" className={buttonClasses('secondary', 'md')}>
          Continue shopping
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
  const headingRef = useRef<HTMLHeadingElement>(null);

  const status = order?.status ?? 'pending';
  const isPaid = status === 'paid' || status === 'fulfilled';
  const isProcessing = orderQuery.isLoading || status === 'pending';
  const timedOut = orderQuery.isPollingTimedOut;
  // Terminal = an outcome was reached, or we stopped waiting for one.
  const isTerminal = (!isProcessing || timedOut) && !orderQuery.isError;

  // Once paid, the server cart is consumed — refetch so the badge resets (covers
  // the live flow where the webhook clears it).
  useEffect(() => {
    if (isPaid) void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
  }, [isPaid, queryClient]);

  // F7: on reaching a terminal state, move focus to the result heading so screen
  // reader + keyboard users land on the outcome instead of the stale spinner.
  useEffect(() => {
    if (isTerminal) headingRef.current?.focus();
  }, [isTerminal, status, timedOut]);

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

  let view: ReactNode;
  let announcement: string;
  if (isProcessing && !timedOut) {
    view = <ProcessingView headingRef={headingRef} />;
    announcement = 'Payment processing — waiting for confirmation.';
  } else if (timedOut && status === 'pending') {
    view = <ProcessingTimeoutView headingRef={headingRef} orderId={orderId} />;
    announcement = 'Still processing — this is taking longer than expected. You can track it from your orders.';
  } else if (isPaid && order) {
    view = <PaidView order={order} headingRef={headingRef} />;
    announcement = 'Payment confirmed. Your order is placed.';
  } else if (status === 'cancelled') {
    view = <CancelledView orderId={orderId} headingRef={headingRef} />;
    announcement = 'Order cancelled. You were not charged.';
  } else {
    view = <FailedView headingRef={headingRef} />;
    announcement = 'Payment didn’t go through. Your card was not charged.';
  }

  return (
    <div className="container-page py-16">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">{view}</div>
      {/* F7: the ONLY live region — a concise status sentence. The heading and
          links above are not announced; focus is moved to the heading instead. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
