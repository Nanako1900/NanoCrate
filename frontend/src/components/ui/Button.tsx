import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'relative inline-flex items-center justify-center gap-2 rounded-md font-medium select-none ' +
  'transition-[transform,background-color,border-color,box-shadow,color] duration-150 ease-out ' +
  // tactile press (echoes a keyswitch) — keyboard + pointer both get the dip
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-on shadow-sm hover:bg-accent-strong hover:shadow-md',
  secondary: 'border border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-sunken',
  ghost: 'bg-transparent text-ink hover:bg-surface-sunken',
  danger: 'bg-stock-out text-paper shadow-sm hover:brightness-110 hover:shadow-md',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-base',
};

/** Shared class string so links can be styled as buttons too. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows an inline spinner, disables interaction, and sets aria-busy. */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  );
}
