import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { useFieldProps } from './FormField';

/** Shared control surface for input/select/textarea. Invalid state is driven by
 *  aria-invalid (set by FormField), so one class string covers every state:
 *  default / hover / focus-visible (steel-blue, global) / disabled / invalid. */
export const controlBase =
  'w-full rounded-md border border-line bg-surface text-sm text-ink shadow-inset ' +
  'transition-colors duration-150 placeholder:text-ink-faint ' +
  'hover:border-line-strong focus:border-interactive ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-[invalid=true]:border-stock-out aria-[invalid=true]:hover:border-stock-out';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ className, invalid, ...rest }: InputProps) {
  const field = useFieldProps();
  const ariaInvalid = field['aria-invalid'] || invalid || undefined;
  return (
    <input
      className={cn(controlBase, 'h-10 px-3', className)}
      {...field}
      {...rest}
      aria-invalid={ariaInvalid}
    />
  );
}
