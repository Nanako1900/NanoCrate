import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { useFieldProps } from './FormField';
import { controlBase } from './Input';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** Native select with a custom chevron (token-colored, theme-aware). */
export function Select({ className, invalid, children, ...rest }: SelectProps) {
  const field = useFieldProps();
  const ariaInvalid = field['aria-invalid'] || invalid || undefined;
  return (
    <div className="relative">
      <select
        className={cn(
          controlBase,
          'h-10 cursor-pointer appearance-none pl-3 pr-9',
          className,
        )}
        {...field}
        {...rest}
        aria-invalid={ariaInvalid}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
