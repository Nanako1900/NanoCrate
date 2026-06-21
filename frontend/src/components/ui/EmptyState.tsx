import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface px-6 py-16 text-center">
      <p className="label-mono text-2xs uppercase tracking-[0.08em] text-ink-faint">No results</p>
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      {description && <p className="text-ink-soft">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
