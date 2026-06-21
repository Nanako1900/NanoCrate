import { cn } from '@/lib/cn';

interface QtyStepperProps {
  qty: number;
  max?: number;
  min?: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
  label?: string;
}

// aria-disabled (not `disabled`) so the control keeps keyboard focus at the
// bounds; pointer-events-none + opacity convey the disabled affordance visually.
const btn =
  'inline-flex h-9 w-9 items-center justify-center text-ink transition-[transform,background-color,color] duration-150 ease-out hover:bg-surface-sunken active:translate-y-px aria-disabled:pointer-events-none aria-disabled:opacity-40';

/** Accessible −/+ quantity stepper. 36px targets within a 44px-tall row. */
export function QtyStepper({ qty, max, min = 1, onChange, disabled = false, label = 'Quantity' }: QtyStepperProps) {
  const canDec = !disabled && qty > min;
  const canInc = !disabled && (max === undefined || qty < max);

  return (
    <div className="inline-flex items-center rounded-md border border-line bg-surface">
      <button
        type="button"
        className={cn(btn, 'rounded-l-md')}
        // Guard to a no-op at the bound: the button stays focusable (no `disabled`)
        // so keyboard focus isn't dropped when you hit min/max.
        onClick={() => canDec && onChange(qty - 1)}
        aria-disabled={!canDec}
        aria-label={`Decrease ${label.toLowerCase()}`}
      >
        <span aria-hidden="true">−</span>
      </button>
      <span
        role="status"
        aria-live="polite"
        className="min-w-9 px-1 text-center font-mono text-sm tabular-nums text-ink"
      >
        <span className="sr-only">{label}: </span>
        {qty}
      </span>
      <button
        type="button"
        className={cn(btn, 'rounded-r-md')}
        onClick={() => canInc && onChange(qty + 1)}
        aria-disabled={!canInc}
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
