import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type IconButtonVariant = 'solid' | 'outline' | 'ghost' | 'danger';
export type IconButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-md ' +
  'transition-[transform,background-color,border-color,color] duration-150 ease-out ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-40 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive';

const VARIANTS: Record<IconButtonVariant, string> = {
  solid: 'bg-accent text-accent-ink hover:bg-accent-strong',
  outline: 'border border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink',
  ghost: 'bg-transparent text-ink-soft hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-transparent text-ink-soft hover:bg-stock-out-bg hover:text-stock-out-ink',
};

const SIZES: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
};

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — icon-only controls must carry an accessible name. */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

/** Square, icon-only button. The icon is passed as children and made decorative. */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}
