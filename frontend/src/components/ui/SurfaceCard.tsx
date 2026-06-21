import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Raised paper panel — the base surface for spec blocks and detail columns. */
export function SurfaceCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-surface shadow-sm', className)} {...rest} />;
}
