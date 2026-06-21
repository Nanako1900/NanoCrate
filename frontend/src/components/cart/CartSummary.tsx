import type { ReactNode } from 'react';
import type { Cart } from '@/services/types';
import { formatPrice } from '@/lib/format';
import { pluralize } from '@/lib/format';

interface CartSummaryProps {
  cart: Cart;
  children?: ReactNode;
}

/** Subtotal block reused by the drawer footer and the cart page. */
export function CartSummary({ cart, children }: CartSummaryProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-soft">
          Subtotal
          <span className="ml-2 font-mono text-2xs tabular-nums text-ink-faint">
            {cart.item_count} {pluralize(cart.item_count, 'item')}
          </span>
        </span>
        <span className="font-mono text-lg font-semibold tabular-nums text-ink">
          {formatPrice(cart.subtotal_cents, cart.currency)}
        </span>
      </div>
      <p className="text-2xs text-ink-faint">Taxes and shipping are calculated at checkout.</p>
      {children}
    </div>
  );
}
