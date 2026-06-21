import type { Variant } from '@/services/types';
import { formatPrice } from '@/lib/format';
import { StockIndicator } from '@/components/ui/StockIndicator';
import { cn } from '@/lib/cn';

interface VariantPickerProps {
  variants: Variant[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * Real radio inputs inside a fieldset → native keyboard semantics (arrow keys,
 * screen-reader grouping) for free, with the visual treatment driven by state.
 */
export function VariantPicker({ variants, selectedId, onSelect }: VariantPickerProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="label-mono mb-2">Configuration</legend>
      <div className="flex flex-col gap-2">
        {variants.map((variant) => {
          const selected = variant.id === selectedId;
          const soldOut = variant.available <= 0;
          return (
            <label
              key={variant.id}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-3 rounded-md border px-4 py-3 transition-[transform,background-color,border-color] duration-150 ease-out',
                'focus-within:ring-2 focus-within:ring-interactive',
                selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong',
                soldOut && 'opacity-70',
              )}
            >
              <input
                type="radio"
                name="variant"
                value={variant.id}
                checked={selected}
                onChange={() => onSelect(variant.id)}
                className="sr-only"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-medium text-ink">{variant.name}</span>
                <span className="font-mono text-2xs uppercase tracking-[0.06em] text-ink-faint">{variant.sku}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-sm font-medium tabular-nums text-ink">
                  {formatPrice(variant.price_cents, variant.currency)}
                </span>
                <StockIndicator available={variant.available} />
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
