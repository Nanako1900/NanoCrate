import { cn } from '@/lib/cn';

interface QtyStepperProps {
  qty: number;
  max?: number;
  min?: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
  label?: string;
}

const btn =
  'inline-flex h-9 w-9 items-center justify-center text-ink transition-[transform,background-color,color] duration-150 ease-out hover:bg-surface-sunken active:translate-y-px disabled:pointer-events-none disabled:opacity-40';

/** Accessible −/+ quantity stepper. 36px targets within a 44px-tall row. */
export function QtyStepper({ qty, max, min = 1, onChange, disabled = false, label = 'Quantity' }: QtyStepperProps) {
  const canDec = !disabled && qty > min;
  const canInc = !disabled && (max === undefined || qty < max);

  return (
    <div className="inline-flex items-center rounded-md border border-line bg-surface">
      <button
        type="button"
        className={cn(btn, 'rounded-l-md')}
        onClick={() => onChange(qty - 1)}
        disabled={!canDec}
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
        onClick={() => onChange(qty + 1)}
        disabled={!canInc}
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
