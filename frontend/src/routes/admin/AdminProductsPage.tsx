import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { PlusIcon } from '@/components/admin/icons';
import { DataTable, type Column, type SortState } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button, buttonClasses } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/ToastContext';
import { useAdminProducts, useAdminProductTypes, useArchiveProduct } from '@/hooks/admin/useAdminProducts';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { AdminProductListItem, ProductStatus } from '@/services/admin-types';

const STATUS_TONE: Record<ProductStatus, BadgeTone> = { active: 'in', draft: 'low', archived: 'neutral' };

function StatusBadge({ status }: { status: ProductStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} mono>
      {status}
    </Badge>
  );
}

export function AdminProductsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const archive = useArchiveProduct();
  const { data: types } = useAdminProductTypes();

  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ ids: string[]; label: string } | null>(null);

  const query = useMemo(
    () => ({ q: q || undefined, type: type || undefined, status: status || undefined, sort: `${sort.key}:${sort.dir}`, page, limit: 8 }),
    [q, type, status, sort, page],
  );
  const { data, isLoading, isError, error, refetch } = useAdminProducts(query);

  const rows = data?.items ?? [];
  const pageCount = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.limit)) : 1;

  function resetPageThen(fn: () => void) {
    setPage(1);
    setSelected(new Set());
    fn();
  }

  async function runArchive(ids: string[]) {
    const results = await Promise.allSettled(ids.map((id) => archive.mutateAsync(id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    setSelected(new Set());
    setConfirm(null);
    if (failed === 0) {
      toast({ tone: 'success', title: ids.length > 1 ? `${ids.length} products archived` : 'Product archived' });
    } else {
      toast({ tone: 'error', title: 'Some products could not be archived', description: `${failed} failed.` });
    }
  }

  const columns: Column<AdminProductListItem>[] = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-3">
          <img src={`/img/keyboards/${p.slug}.svg`} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded border border-line bg-surface-sunken object-cover" loading="lazy" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{p.name}</p>
            <p className="label-mono normal-case text-ink-faint">{p.slug}</p>
          </div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (p) => <span className="capitalize text-ink-soft">{p.type}</span>, hideBelow: 'md' },
    { key: 'status', header: 'Status', sortable: true, cell: (p) => <StatusBadge status={p.status} /> },
    { key: 'variants', header: 'Variants', align: 'right', cell: (p) => <span className="font-mono tabular-nums text-ink-soft">{p.variant_count}</span>, hideBelow: 'lg' },
    {
      key: 'price',
      header: 'Price',
      sortable: true,
      align: 'right',
      hideBelow: 'sm',
      cell: (p) => (
        <span className="font-mono tabular-nums text-ink">
          {p.price_range_cents.min === p.price_range_cents.max
            ? formatPrice(p.price_range_cents.min)
            : `${formatPrice(p.price_range_cents.min)}–${formatPrice(p.price_range_cents.max)}`}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      sortable: true,
      align: 'right',
      cell: (p) => <span className={cn('font-mono tabular-nums', p.total_available === 0 ? 'text-stock-out-ink' : 'text-ink')}>{p.total_available}</span>,
    },
  ];

  return (
    <>
      <AdminPageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Products' }]}
        title="Products"
        description="Catalog items, variants, and availability."
        actions={
          <Link to="/admin/products/new" className={buttonClasses('primary', 'sm')}>
            <PlusIcon size={16} />
            New product
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <Input
            type="search"
            value={q}
            onChange={(e) => resetPageThen(() => setQ(e.target.value))}
            placeholder="Search products…"
            aria-label="Search products"
          />
        </div>
        <Select value={type} onChange={(e) => resetPageThen(() => setType(e.target.value))} aria-label="Filter by type" className="w-auto">
          <option value="">All types</option>
          {types?.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => resetPageThen(() => setStatus(e.target.value))} aria-label="Filter by status" className="w-auto">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      {selected.size > 0 && (
        <div role="status" className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-interactive/30 bg-interactive-soft px-4 py-2 text-sm">
          <span className="font-medium text-ink">{selected.size} selected</span>
          <Button variant="danger" size="sm" onClick={() => setConfirm({ ids: [...selected], label: `${selected.size} products` })}>
            Archive
          </Button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-interactive hover:underline">
            Clear
          </button>
        </div>
      )}

      <DataTable
        caption="Products"
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        sort={sort}
        onSortChange={(s) => resetPageThen(() => setSort(s))}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        onRowClick={(p) => navigate(`/admin/products/${p.id}`)}
        rowLabel={(p) => `Edit ${p.name}`}
        rowActions={(p) => (
          <>
            <IconButton label={`Edit ${p.name}`} size="sm" onClick={() => navigate(`/admin/products/${p.id}`)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </IconButton>
            {p.status !== 'archived' && (
              <IconButton label={`Archive ${p.name}`} size="sm" variant="danger" onClick={() => setConfirm({ ids: [p.id], label: p.name })}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />
                </svg>
              </IconButton>
            )}
          </>
        )}
        loading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
      />

      <Pagination className="mt-5" page={page} pageCount={pageCount} onPageChange={setPage} />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && runArchive(confirm.ids)}
        title="Archive product?"
        description={confirm ? `${confirm.label} will be hidden from the storefront. You can restore it later.` : ''}
        confirmLabel="Archive"
        loading={archive.isPending}
      />
    </>
  );
}
