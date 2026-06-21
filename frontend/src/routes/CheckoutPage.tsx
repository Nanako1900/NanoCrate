import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { isMockMode } from '@/lib/env';
import { useCart } from '@/hooks/useCart';
import { OrderSummaryCard } from '@/components/checkout/OrderSummaryCard';
import { MockPaymentPanel } from '@/components/checkout/MockPaymentPanel';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { buttonClasses } from '@/components/ui/Button';

const StripePaymentPanel = lazy(() => import('@/components/checkout/StripePaymentPanel'));

export function CheckoutPage() {
  const cartQuery = useCart();
  const cart = cartQuery.data;
  const isEmpty = !cart || cart.items.length === 0;

  return (
    <div className="container-page py-8 lg:py-12">
      <PageHeader eyebrow="Checkout · secure" title="Checkout" description="Review your order and complete payment." />

      {cartQuery.isLoading ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <Skeleton className="h-80 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : cartQuery.isError ? (
        <div className="mt-10">
          <ErrorState error={cartQuery.error} onRetry={() => void cartQuery.refetch()} />
        </div>
      ) : isEmpty ? (
        <div className="mt-10">
          <EmptyState
            eyebrow="Empty cart"
            title="Your cart is empty"
            description="Add a board before checking out."
            action={
              <Link to="/" className={buttonClasses('primary', 'sm')}>
                Browse keyboards
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
          <section aria-label="Payment">
            <h2 className="mb-4 label-mono">Payment</h2>
            {isMockMode ? (
              <MockPaymentPanel cart={cart} />
            ) : (
              <Suspense fallback={<p className="label-mono py-8 text-center">Loading secure payment…</p>}>
                <StripePaymentPanel cart={cart} />
              </Suspense>
            )}
          </section>
          <aside className="lg:sticky lg:top-24">
            <OrderSummaryCard cart={cart} />
          </aside>
        </div>
      )}
    </div>
  );
}
