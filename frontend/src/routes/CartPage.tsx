import { Link } from 'react-router-dom';
import { useCart, useRemoveCartItem, useUpdateCartItem } from '@/hooks/useCart';
import { CartLineItem } from '@/components/cart/CartLineItem';
import { CartSummary } from '@/components/cart/CartSummary';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { buttonClasses } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { pluralize } from '@/lib/format';

export function CartPage() {
  const cartQuery = useCart();
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();

  const cart = cartQuery.data;
  const pendingItemId = update.isPending
    ? update.variables?.itemId
    : remove.isPending
      ? remove.variables?.itemId
      : undefined;
  const mutationFailed = update.isError || remove.isError;

  return (
    <div className="container-page py-8 lg:py-12">
      <PageHeader eyebrow="Your cart" title="Cart" />

      {cartQuery.isLoading ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      ) : cartQuery.isError ? (
        <div className="mt-10">
          <ErrorState error={cartQuery.error} onRetry={() => void cartQuery.refetch()} />
        </div>
      ) : !cart || cart.items.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            eyebrow="Empty cart"
            title="Your cart is empty"
            description="Find a board worth building on."
            action={
              <Link to="/" className={buttonClasses('primary', 'sm')}>
                Browse keyboards
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
          <section aria-label={`${cart.item_count} ${pluralize(cart.item_count, 'item')} in cart`}>
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface px-5 shadow-sm">
              {cart.items.map((item) => (
                <CartLineItem
                  key={item.id}
                  item={item}
                  currency={cart.currency}
                  onQty={(qty) => update.mutate({ itemId: item.id, qty })}
                  onRemove={() => remove.mutate({ itemId: item.id })}
                  pending={pendingItemId === item.id}
                />
              ))}
            </ul>
            {mutationFailed && (
              <p role="alert" className="mt-3 rounded-md border border-stock-out-ink/20 bg-stock-out-bg px-4 py-2 text-sm text-stock-out-ink">
                Couldn’t update your cart. Please try again.
              </p>
            )}
            <Link
              to="/"
              className="mt-4 inline-block font-mono text-2xs uppercase tracking-[0.08em] text-ink-faint underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              ← Continue shopping
            </Link>
          </section>

          <aside className="lg:sticky lg:top-24">
            <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
              <CartSummary cart={cart}>
                <Link to="/checkout" className={buttonClasses('primary', 'md', 'mt-1 w-full')}>
                  Checkout
                </Link>
              </CartSummary>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
