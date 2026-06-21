import { cn } from '@/lib/cn';

interface SpinnerProps {
  /** Pixel size of the square SVG. */
  size?: number;
  className?: string;
  /** Accessible label; omit when a sibling already announces the loading state. */
  label?: string;
}

/** Compositor-friendly loading spinner (animates transform only). The global
 *  reduced-motion rule freezes the spin; the ring still reads as a busy state. */
export function Spinner({ size = 18, className, label }: SpinnerProps) {
  return (
    <svg
      className={cn('animate-spin text-current', className)}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9" strokeOpacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
