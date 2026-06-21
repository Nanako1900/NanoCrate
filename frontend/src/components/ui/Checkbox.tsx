import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
}

/** Accessible checkbox with a designed box (accent fill when checked). The
 *  native input is the focus + state owner (steel-blue ring via global focus). */
export function Checkbox({ label, className, id, ...rest }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="relative inline-flex h-5 w-5 shrink-0">
        <input
          id={inputId}
          type="checkbox"
          className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-line bg-surface shadow-inset transition-colors duration-150 checked:border-accent checked:bg-accent hover:border-line-strong disabled:opacity-50"
          {...rest}
        />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 m-auto hidden text-accent-ink peer-checked:block"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m20 6-11 11-5-5" />
        </svg>
      </span>
      {label && (
        <label htmlFor={inputId} className="cursor-pointer select-none text-sm text-ink">
          {label}
        </label>
      )}
    </span>
  );
}
