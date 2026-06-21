import { cn } from '@/lib/cn';

interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}

function pageWindow(page: number, pageCount: number): number[] {
  const candidates = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  return [...candidates].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
}

const itemBase =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm transition-[transform,background-color,border-color,color] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-40';

export function Pagination({ page, pageCount, onPageChange, className }: PaginationProps) {
  if (pageCount <= 1) return null;
  const windowed = pageWindow(page, pageCount);

  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-center gap-1.5', className)}>
      <button
        type="button"
        className={cn(itemBase, 'border border-line bg-surface text-ink hover:border-line-strong')}
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        ←
      </button>

      <ol className="flex items-center gap-1.5">
        {windowed.map((p, index) => {
          const previous = windowed[index - 1];
          const gap = previous !== undefined && p - previous > 1;
          const active = p === page;
          return (
            <li key={p} className="flex items-center gap-1.5">
              {gap && <span className="px-1 text-ink-faint" aria-hidden="true">…</span>}
              <button
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={active ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={cn(
                  itemBase,
                  active
                    ? 'bg-ink font-medium text-ink-invert'
                    : 'border border-line bg-surface text-ink hover:border-line-strong',
                )}
              >
                <span className="font-mono tabular-nums">{p}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        className={cn(itemBase, 'border border-line bg-surface text-ink hover:border-line-strong')}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
        aria-label="Next page"
      >
        →
      </button>
    </nav>
  );
}
