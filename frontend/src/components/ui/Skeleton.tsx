import { cn } from '@/lib/cn';

interface SkeletonProps {
  className?: string;
}

/** Loading placeholder. Pulses opacity only (compositor-friendly); the global
 *  reduced-motion rule disables the pulse for users who opt out. */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-surface-sunken', className)} />;
}
