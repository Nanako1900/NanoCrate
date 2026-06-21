import type { Cart } from '@/services/types';
import { formatPrice } from '@/lib/format';

/** Read-only order summary shown alongside the payment panel at checkout. */
export function OrderSummaryCard({ cart }: { cart: Cart }) {
  return (
    <section aria-label="Order summary" className="rounded-lg border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight text-ink">Order summary</h2>
      <ul className="mt-4 divide-y divide-line">
        {cart.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug text-ink">{item.name}</p>
              <p className="label-mono mt-1">
                {item.sku} · ×{item.qty}
              </p>
            </div>
            <p className="shrink-0 font-mono text-sm tabular-nums text-ink">
              {formatPrice(item.line_total_cents, cart.currency)}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-baseline justify-between rounded-md bg-surface-sunken px-3 py-3">
        <span className="font-medium text-ink">Total</span>
        <span className="font-mono text-xl font-semibold tabular-nums text-ink">
          {formatPrice(cart.subtotal_cents, cart.currency)}
        </span>
      </div>
    </section>
  );
}
