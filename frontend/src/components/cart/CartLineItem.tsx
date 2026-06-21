import type { CartItem } from '@/services/types';
import { formatPrice } from '@/lib/format';
import { QtyStepper } from './QtyStepper';
import { cn } from '@/lib/cn';

interface CartLineItemProps {
  item: CartItem;
  currency: string;
  onQty: (qty: number) => void;
  onRemove: () => void;
  pending?: boolean;
}

export function CartLineItem({ item, currency, onQty, onRemove, pending = false }: CartLineItemProps) {
  const low = item.available > 0 && item.available <= 5;

  return (
    <li className={cn('flex flex-col gap-3 py-4 transition-opacity duration-150', pending && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium leading-snug text-ink">{item.name}</p>
          <p className="label-mono mt-1">{item.sku}</p>
        </div>
        <p className="shrink-0 font-mono text-sm font-medium tabular-nums text-ink">
          {formatPrice(item.line_total_cents, currency)}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <QtyStepper qty={item.qty} max={item.available} onChange={onQty} disabled={pending} />
        <div className="flex items-center gap-3">
          {low && <span className="label-mono text-stock-low-ink">{item.available} left</span>}
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            className="rounded-sm font-mono text-2xs uppercase tracking-[0.06em] text-ink-faint underline-offset-4 transition-colors duration-150 hover:text-stock-out-ink hover:underline disabled:opacity-40"
          >
            Remove
            <span className="sr-only"> {item.name}</span>
          </button>
        </div>
      </div>

      <p className="font-mono text-2xs tabular-nums text-ink-faint">
        {formatPrice(item.unit_price_cents, currency)} each
      </p>
    </li>
  );
}
