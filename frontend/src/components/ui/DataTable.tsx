import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: string;
  dir: SortDir;
}

export interface Column<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Hide the column below this breakpoint to degrade gracefully on narrow screens. */
  hideBelow?: 'sm' | 'md' | 'lg';
  /** Extra classes applied to the cell + header. */
  className?: string;
  /** Header width hint. */
  width?: string;
}

interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Accessible table caption (visually hidden). */
  caption: string;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  rowActions?: (row: Row) => ReactNode;
  onRowClick?: (row: Row) => void;
  loading?: boolean;
  /** Falsy = no error. Truthy renders the error state. */
  error?: unknown;
  onRetry?: () => void;
  /** Rendered when there are no rows and not loading/error. */
  empty?: ReactNode;
  className?: string;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const HIDE = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
} as const;

const cellPad = 'px-3 py-[var(--space-row)]';

function HeaderCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="h-4 w-4 cursor-pointer appearance-none rounded border border-line bg-surface checked:border-accent checked:bg-accent indeterminate:border-accent indeterminate:bg-accent"
    />
  );
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  sort,
  onSortChange,
  selectable = false,
  selected,
  onSelectedChange,
  rowActions,
  onRowClick,
  loading = false,
  error,
  onRetry,
  empty,
  className,
}: DataTableProps<Row>) {
  const selectedSet = selected ?? new Set<string>();
  const allKeys = rows.map(rowKey);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedSet.has(k));
  const someSelected = allKeys.some((k) => selectedSet.has(k));

  function toggleAll(next: boolean) {
    if (!onSelectedChange) return;
    const copy = new Set(selectedSet);
    for (const k of allKeys) (next ? copy.add(k) : copy.delete(k));
    onSelectedChange(copy);
  }
  function toggleRow(key: string, next: boolean) {
    if (!onSelectedChange) return;
    const copy = new Set(selectedSet);
    next ? copy.add(key) : copy.delete(key);
    onSelectedChange(copy);
  }

  function headerSort(col: Column<Row>) {
    if (!col.sortable || !onSortChange) return;
    const dir: SortDir = sort?.key === col.key && sort.dir === 'asc' ? 'desc' : 'asc';
    onSortChange({ key: col.key, dir });
  }

  if (error) {
    return (
      <div className="rounded-lg border border-line bg-surface p-6">
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className={cn('overflow-x-auto rounded-lg border border-line bg-surface', className)}>
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-surface-sunken">
            {selectable && (
              <th scope="col" className={cn(cellPad, 'w-10')}>
                <HeaderCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                  label="Select all rows"
                />
              </th>
            )}
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable ? ariaSort ?? 'none' : undefined}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    cellPad,
                    'label-mono whitespace-nowrap',
                    ALIGN[col.align ?? 'left'],
                    col.hideBelow && HIDE[col.hideBelow],
                    col.className,
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => headerSort(col)}
                      className="group inline-flex items-center gap-1 text-ink-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
                    >
                      {col.header}
                      <span aria-hidden="true" className={cn(active ? 'text-accent opacity-100' : 'opacity-40 group-hover:opacity-70')}>
                        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
            {rowActions && <th scope="col" className={cn(cellPad, 'w-px text-right')}><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-line/60">
                {selectable && <td className={cellPad} />}
                {columns.map((col) => (
                  <td key={col.key} className={cn(cellPad, col.hideBelow && HIDE[col.hideBelow])}>
                    <div className="h-4 w-full max-w-[8rem] animate-pulse rounded bg-surface-sunken" />
                  </td>
                ))}
                {rowActions && <td className={cellPad} />}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)} className="p-0">
                {empty ?? <EmptyState title="Nothing here yet" description="No records match the current view." />}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const key = rowKey(row);
              const isSelected = selectedSet.has(key);
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-line/60 transition-colors last:border-0',
                    isSelected ? 'bg-interactive-soft' : 'hover:bg-surface-sunken',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {selectable && (
                    <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleRow(key, e.target.checked)}
                        aria-label={`Select row ${key}`}
                        className="h-4 w-4 cursor-pointer appearance-none rounded border border-line bg-surface checked:border-accent checked:bg-accent"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        cellPad,
                        'text-ink',
                        ALIGN[col.align ?? 'left'],
                        col.hideBelow && HIDE[col.hideBelow],
                        col.className,
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className={cn(cellPad, 'text-right')} onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">{rowActions(row)}</div>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
