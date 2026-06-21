import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart, useRemoveCartItem, useUpdateCartItem } from '@/hooks/useCart';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useCartUI } from './CartUIContext';
import { CartLineItem } from './CartLineItem';
import { CartSummary } from './CartSummary';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CartDrawer() {
  const { isOpen, close } = useCartUI();
  const { data: cart, isLoading } = useCart();
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel) panel.inert = !isOpen;
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    panel?.focus();
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) {
        // Nothing tabbable inside — keep focus on the panel itself.
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const index = active ? focusables.indexOf(active) : -1;
      if (index === -1) {
        // Focus escaped the tracked set (the panel container, or a control that
        // just became disabled) — pull it back to an end so Tab can't leak out.
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen, close]);

  // Clear latched mutation error state when the drawer closes so a transient
  // failure doesn't show a stale banner on the next open.
  useEffect(() => {
    if (!isOpen) {
      update.reset();
      remove.reset();
    }
    // update/remove identity changes each render; depend only on isOpen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const items = cart?.items ?? [];
  const pendingItemId = update.isPending
    ? update.variables?.itemId
    : remove.isPending
      ? remove.variables?.itemId
      : undefined;
  const mutationFailed = update.isError || remove.isError;

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-[var(--z-overlay)] bg-ink/40 transition-opacity duration-200 ease-out',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={close}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        tabIndex={-1}
        className={cn(
          'fixed inset-y-0 right-0 z-[var(--z-overlay)] flex w-full max-w-md flex-col bg-paper shadow-lift outline-none',
          'transition-transform duration-300 ease-out-expo will-change-transform',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Your cart</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close cart"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-soft transition-[transform,background-color,color] duration-150 ease-out hover:bg-surface-sunken hover:text-ink active:translate-y-px"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5">
          {isLoading ? (
            <p role="status" className="label-mono py-12 text-center">
              Loading…
            </p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="label-mono text-2xs uppercase tracking-[0.08em] text-ink-faint">Empty</p>
              <p className="text-ink-soft">Your cart is empty.</p>
              <Link to="/" onClick={close} className={buttonClasses('secondary', 'sm', 'mt-1')}>
                Browse keyboards
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {cart &&
                items.map((item) => (
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
          )}
        </div>

        {mutationFailed && (
          <p role="alert" className="border-t border-stock-out-ink/20 bg-stock-out-bg px-5 py-3 text-sm text-stock-out-ink">
            Couldn’t update your cart. Please try again.
          </p>
        )}

        {items.length > 0 && cart && (
          <footer className="border-t border-line px-5 py-4">
            <CartSummary cart={cart}>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Link to="/cart" onClick={close} className={buttonClasses('secondary', 'md')}>
                  View cart
                </Link>
                <Link to="/checkout" onClick={close} className={buttonClasses('primary', 'md')}>
                  Checkout
                </Link>
              </div>
            </CartSummary>
          </footer>
        )}
      </div>
    </>
  );
}
