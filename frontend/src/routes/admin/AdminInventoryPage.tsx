import { useState } from 'react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { useInventory, useRestock, useStockLedger } from '@/hooks/admin/useInventory';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ApiError } from '@/services/api';
import type { InventoryRow, LedgerKind } from '@/services/admin-types';

const LOW_THRESHOLD = 5;
const LEDGER_TONE: Record<LedgerKind, BadgeTone> = { restock: 'in', reserve: 'low', commit: 'neutral', release: 'accent', expire: 'out' };

function RestockModal({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const { toast } = useToast();
  const restock = useRestock();
  const [qty, setQty] = useState('10');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) return setError('Enter a positive whole number.');
    try {
      await restock.mutateAsync({ variantId: row.variant_id, qty: n });
      toast({ tone: 'success', title: 'Stock added', description: `${row.sku} +${n}` });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Restock failed.');
    }
  }

  return (
    <Modal
      open
      onClose={restock.isPending ? () => {} : onClose}
      title="Restock variant"
      description={`${row.product_name} · ${row.sku}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={restock.isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} loading={restock.isPending}>
            Add stock
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-ink-faint">Available</dt>
          <dd className="text-right font-mono tabular-nums text-ink">{row.available}</dd>
          <dt className="text-ink-faint">Reserved</dt>
          <dd className="text-right font-mono tabular-nums text-ink">{row.reserved}</dd>
        </dl>
        {error && <p role="alert" className="text-sm text-stock-out-ink">{error}</p>}
        <FormField label="Quantity to add" required>
          <Input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="font-mono tabular-nums" min={1} />
        </FormField>
      </div>
    </Modal>
  );
}

function delta(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function LedgerModal({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const { data, isLoading, isError } = useStockLedger(row.variant_id);
  const entries = data?.entries ?? [];
  return (
    <Modal open onClose={onClose} title="Stock ledger" description={`${row.product_name} · ${row.sku}`} size="lg">
      {isLoading ? (
        <div className="flex justify-center py-10 text-ink-faint">
          <Spinner size={24} label="Loading ledger" />
        </div>
      ) : isError ? (
        <p className="py-6 text-center text-sm text-stock-out-ink">Couldn’t load the ledger.</p>
      ) : entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">Stock movements for {row.sku}</caption>
            <thead>
              <tr className="border-b border-line bg-surface-sunken">
                <th scope="col" className="label-mono px-3 py-2 text-left">When</th>
                <th scope="col" className="label-mono px-3 py-2 text-left">Movement</th>
                <th scope="col" className="label-mono px-3 py-2 text-right">Δ Available</th>
                <th scope="col" className="label-mono px-3 py-2 text-right">Δ Reserved</th>
                <th scope="col" className="label-mono px-3 py-2 text-left">Reservation</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-line/60 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-soft">{formatDate(entry.created_at)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={LEDGER_TONE[entry.kind]} mono>
                      {entry.kind}
                    </Badge>
                  </td>
                  <td className={cn('px-3 py-2 text-right font-mono tabular-nums', entry.delta_available >= 0 ? 'text-stock-in-ink' : 'text-stock-out-ink')}>
                    {delta(entry.delta_available)}
                  </td>
                  <td className={cn('px-3 py-2 text-right font-mono tabular-nums', entry.delta_reserved > 0 ? 'text-stock-low-ink' : entry.delta_reserved < 0 ? 'text-ink-soft' : 'text-ink-faint')}>
                    {delta(entry.delta_reserved)}
                  </td>
                  <td className="px-3 py-2 font-mono text-2xs text-ink-faint">{entry.reservation_id ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-ink-soft">No stock movements recorded.</p>
      )}
    </Modal>
  );
}

export function AdminInventoryPage() {
  const [lowOnly, setLowOnly] = useState(false);
  const [restocking, setRestocking] = useState<InventoryRow | null>(null);
  const [ledgerFor, setLedgerFor] = useState<InventoryRow | null>(null);
  const { data, isLoading, isError, error, refetch } = useInventory({ low: lowOnly, threshold: LOW_THRESHOLD });
  const rows = data?.rows ?? [];

  const columns: Column<InventoryRow>[] = [
    {
      key: 'sku',
      header: 'Variant',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{r.product_name}</p>
          <p className="label-mono normal-case text-ink-faint">{r.sku}</p>
        </div>
      ),
    },
    { key: 'available', header: 'Available', align: 'right', cell: (r) => <span className={cn('font-mono tabular-nums', r.available === 0 ? 'text-stock-out-ink' : r.available <= LOW_THRESHOLD ? 'text-stock-low-ink' : 'text-ink')}>{r.available}</span> },
    { key: 'reserved', header: 'Reserved', align: 'right', hideBelow: 'sm', cell: (r) => <span className="font-mono tabular-nums text-ink-soft">{r.reserved}</span> },
    { key: 'on_hand', header: 'On hand', align: 'right', hideBelow: 'md', cell: (r) => <span className="font-mono tabular-nums text-ink-soft">{r.available + r.reserved}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (r.available === 0 ? <Badge tone="out" mono>out</Badge> : r.available <= LOW_THRESHOLD ? <Badge tone="low" mono>low</Badge> : <Badge tone="in" mono>ok</Badge>),
    },
  ];

  return (
    <>
      <AdminPageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Inventory' }]}
        title="Inventory"
        description="Reserved vs. available per variant, backed by an append-only ledger."
        actions={<Checkbox label="Low stock only" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />}
      />

      <DataTable
        caption="Inventory"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.variant_id}
        rowActions={(r) => (
          <>
            <Button variant="secondary" size="sm" onClick={() => setLedgerFor(r)}>
              Ledger
            </Button>
            <Button size="sm" onClick={() => setRestocking(r)}>
              Restock
            </Button>
          </>
        )}
        loading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
        empty={lowOnly ? <div className="px-6 py-10 text-center text-sm text-ink-soft">No low-stock variants — nicely stocked.</div> : undefined}
      />

      {restocking && <RestockModal row={restocking} onClose={() => setRestocking(null)} />}
      {ledgerFor && <LedgerModal row={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </>
  );
}
