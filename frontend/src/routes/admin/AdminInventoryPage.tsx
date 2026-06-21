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
import { LEDGER_KIND_LABEL } from '@/components/admin/status';
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
    if (!Number.isInteger(n) || n <= 0) return setError('请输入正整数。');
    try {
      await restock.mutateAsync({ variantId: row.variant_id, qty: n });
      toast({ tone: 'success', title: '已补货', description: `${row.sku} +${n}` });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '补货失败。');
    }
  }

  return (
    <Modal
      open
      onClose={restock.isPending ? () => {} : onClose}
      title="补货"
      description={`${row.product_name} · ${row.sku}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={restock.isPending}>
            取消
          </Button>
          <Button size="sm" onClick={submit} loading={restock.isPending}>
            确认补货
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-ink-faint">可售</dt>
          <dd className="text-right font-mono tabular-nums text-ink">{row.available}</dd>
          <dt className="text-ink-faint">预留</dt>
          <dd className="text-right font-mono tabular-nums text-ink">{row.reserved}</dd>
        </dl>
        {error && <p role="alert" className="text-sm text-stock-out-ink">{error}</p>}
        <FormField label="补货数量" required>
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
    <Modal open onClose={onClose} title="库存台账" description={`${row.product_name} · ${row.sku}`} size="lg">
      {isLoading ? (
        <div className="flex justify-center py-10 text-ink-faint">
          <Spinner size={24} label="正在加载台账" />
        </div>
      ) : isError ? (
        <p className="py-6 text-center text-sm text-stock-out-ink">台账加载失败。</p>
      ) : entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">{row.sku} 的库存变动</caption>
            <thead>
              <tr className="border-b border-line bg-surface-sunken">
                <th scope="col" className="label-mono px-3 py-2 text-left">时间</th>
                <th scope="col" className="label-mono px-3 py-2 text-left">变动</th>
                <th scope="col" className="label-mono px-3 py-2 text-right">可售变化</th>
                <th scope="col" className="label-mono px-3 py-2 text-right">预留变化</th>
                <th scope="col" className="label-mono px-3 py-2 text-left">预留单</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-line/60 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-soft">{formatDate(entry.created_at)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={LEDGER_TONE[entry.kind]} mono>
                      {LEDGER_KIND_LABEL[entry.kind]}
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
        <p className="py-6 text-center text-sm text-ink-soft">暂无库存变动记录。</p>
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
      header: '规格',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{r.product_name}</p>
          <p className="label-mono normal-case text-ink-faint">{r.sku}</p>
        </div>
      ),
    },
    { key: 'available', header: '可售', align: 'right', cell: (r) => <span className={cn('font-mono tabular-nums', r.available === 0 ? 'text-stock-out-ink' : r.available <= LOW_THRESHOLD ? 'text-stock-low-ink' : 'text-ink')}>{r.available}</span> },
    { key: 'reserved', header: '预留', align: 'right', hideBelow: 'sm', cell: (r) => <span className="font-mono tabular-nums text-ink-soft">{r.reserved}</span> },
    { key: 'on_hand', header: '在手', align: 'right', hideBelow: 'md', cell: (r) => <span className="font-mono tabular-nums text-ink-soft">{r.available + r.reserved}</span> },
    {
      key: 'status',
      header: '状态',
      cell: (r) => (r.available === 0 ? <Badge tone="out" mono>缺货</Badge> : r.available <= LOW_THRESHOLD ? <Badge tone="low" mono>紧张</Badge> : <Badge tone="in" mono>正常</Badge>),
    },
  ];

  return (
    <>
      <AdminPageHeader
        breadcrumbs={[{ label: '后台', to: '/admin' }, { label: '库存' }]}
        title="库存"
        description="各规格的可售/预留,基于只追加台账。"
        actions={<Checkbox label="仅看低库存" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />}
      />

      <DataTable
        caption="库存"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.variant_id}
        rowActions={(r) => (
          <>
            <Button variant="secondary" size="sm" onClick={() => setLedgerFor(r)}>
              台账
            </Button>
            <Button size="sm" onClick={() => setRestocking(r)}>
              补货
            </Button>
          </>
        )}
        loading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
        empty={lowOnly ? <div className="px-6 py-10 text-center text-sm text-ink-soft">没有低库存规格,库存充足。</div> : undefined}
      />

      {restocking && <RestockModal row={restocking} onClose={() => setRestocking(null)} />}
      {ledgerFor && <LedgerModal row={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </>
  );
}
