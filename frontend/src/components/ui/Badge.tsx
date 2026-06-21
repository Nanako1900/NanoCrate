import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'in' | 'low' | 'out';

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-surface text-ink-soft',
  accent: 'border-transparent bg-accent-soft text-accent-soft-ink',
  in: 'border-transparent bg-stock-in-bg text-stock-in-ink',
  low: 'border-transparent bg-stock-low-bg text-stock-low-ink',
  out: 'border-transparent bg-stock-out-bg text-stock-out-ink',
};

interface BadgeProps {
  tone?: BadgeTone;
  mono?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', mono = false, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-2xs leading-5',
        mono && 'font-mono uppercase tracking-[0.06em]',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
