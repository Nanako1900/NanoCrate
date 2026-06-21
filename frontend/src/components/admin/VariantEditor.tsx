import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/ToastContext';
import { PlusIcon } from './icons';
import { useCreateVariant, useUpdateVariant } from '@/hooks/admin/useAdminProducts';
import { expandMatrix, parseValues, suggestSku, type OptionGroup } from '@/lib/sku-matrix';
import { formatPrice } from '@/lib/format';
import { ApiError } from '@/services/api';
import type { AdminProductDetail, AdminVariant } from '@/services/admin-types';

const dollarsToCents = (v: string) => Math.round(Number(v) * 100);
const centsToDollars = (c: number) => (c / 100).toFixed(2);

function SingleVariantModal({ product, editing, onClose }: { product: AdminProductDetail; editing: AdminVariant | null; onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateVariant(product.id);
  const update = useUpdateVariant();
  const [sku, setSku] = useState(editing?.sku ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [price, setPrice] = useState(editing ? centsToDollars(editing.price_cents) : '');
  const [available, setAvailable] = useState(editing ? String(editing.available) : '0');
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  async function submit() {
    setError(null);
    if (!sku.trim()) return setError('SKU is required.');
    if (!Number.isFinite(Number(price)) || Number(price) < 0) return setError('Enter a valid price.');
    const payload = { sku: sku.trim(), name: name.trim() || sku.trim(), price_cents: dollarsToCents(price), available: Math.max(0, Math.floor(Number(available)) || 0), attributes: editing?.attributes ?? {} };
    try {
      if (editing) await update.mutateAsync({ variantId: editing.id, input: payload });
      else await create.mutateAsync(payload);
      toast({ tone: 'success', title: editing ? 'Variant updated' : 'Variant added' });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the variant.');
    }
  }

  return (
    <Modal
      open
      onClose={pending ? () => {} : onClose}
      title={editing ? 'Edit variant' : 'Add variant'}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} loading={pending}>
            {editing ? 'Save' : 'Add variant'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && (
          <p role="alert" className="rounded-md border border-stock-out-ink/30 bg-stock-out-bg px-3 py-2 text-sm text-stock-out-ink">
            {error}
          </p>
        )}
        <FormField label="SKU" required>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} className="font-mono uppercase" placeholder="NANO75-RED-PBTW" />
        </FormField>
        <FormField label="Variant name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="75% / Red linear / White PBT" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Price (USD)" required>
            <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="font-mono tabular-nums" placeholder="129.00" />
          </FormField>
          <FormField label="Available">
            <Input type="number" inputMode="numeric" value={available} onChange={(e) => setAvailable(e.target.value)} className="font-mono tabular-nums" />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}

interface MatrixRow {
  sku: string;
  price: string;
  available: string;
  attributes: Record<string, string>;
  label: string;
}

function MatrixModal({ product, onClose }: { product: AdminProductDetail; onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateVariant(product.id);
  const baseSku = product.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8);
  const [groups, setGroups] = useState<{ name: string; raw: string }[]>([
    { name: 'switch', raw: '' },
    { name: 'keycaps', raw: '' },
  ]);
  const [basePrice, setBasePrice] = useState('');
  const [rows, setRows] = useState<MatrixRow[] | null>(null);
  const [pending, setPending] = useState(false);

  const optionGroups: OptionGroup[] = useMemo(
    () => groups.map((g) => ({ name: g.name.trim(), values: parseValues(g.raw) })),
    [groups],
  );
  const combos = useMemo(() => expandMatrix(optionGroups), [optionGroups]);

  function generate() {
    setRows(
      combos.map((c) => ({
        sku: suggestSku(baseSku, c.attributes),
        price: basePrice,
        available: '0',
        attributes: c.attributes,
        label: c.label,
      })),
    );
  }

  async function createAll() {
    if (!rows) return;
    setPending(true);
    const results = await Promise.allSettled(
      rows.map((r) =>
        create.mutateAsync({
          sku: r.sku.trim(),
          name: `${product.name} · ${r.label}`,
          price_cents: dollarsToCents(r.price || '0'),
          available: Math.max(0, Math.floor(Number(r.available)) || 0),
          attributes: r.attributes,
        }),
      ),
    );
    setPending(false);
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed === 0) {
      toast({ tone: 'success', title: `${rows.length} variants created` });
      onClose();
    } else {
      toast({ tone: 'error', title: 'Some variants were rejected', description: `${failed} failed (likely duplicate SKUs).` });
    }
  }

  return (
    <Modal open onClose={pending ? () => {} : onClose} title="Generate variants from options" size="lg" description="Define option dimensions; every combination becomes a variant.">
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g, i) => (
            <div key={i} className="grid gap-2 rounded-md border border-line p-3">
              <FormField label={`Option ${i + 1} name`}>
                <Input value={g.name} onChange={(e) => setGroups((gs) => gs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="switch" />
              </FormField>
              <FormField label="Values" help="Comma or newline separated.">
                <Input value={g.raw} onChange={(e) => setGroups((gs) => gs.map((x, j) => (j === i ? { ...x, raw: e.target.value } : x)))} placeholder="red, brown, silent" />
              </FormField>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <FormField label="Base price (USD)" className="w-40">
            <Input type="number" inputMode="decimal" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} className="font-mono tabular-nums" placeholder="129.00" />
          </FormField>
          <Button variant="secondary" size="sm" onClick={generate} disabled={combos.length === 0}>
            Preview {combos.length > 0 ? `${combos.length} combos` : ''}
          </Button>
        </div>

        {rows && rows.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken">
                  <th scope="col" className="label-mono px-3 py-2 text-left">SKU</th>
                  <th scope="col" className="label-mono px-3 py-2 text-left">Combination</th>
                  <th scope="col" className="label-mono px-3 py-2 text-right">Price</th>
                  <th scope="col" className="label-mono px-3 py-2 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2">
                      <Input value={r.sku} onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} aria-label={`SKU for ${r.label}`} className="h-9 font-mono uppercase" />
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{r.label}</td>
                    <td className="px-3 py-2">
                      <Input type="number" value={r.price} onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} aria-label={`Price for ${r.label}`} className="h-9 w-24 font-mono tabular-nums" />
                    </td>
                    <td className="px-3 py-2">
                      <Input type="number" value={r.available} onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, available: e.target.value } : x)))} aria-label={`Stock for ${r.label}`} className="h-9 w-20 font-mono tabular-nums" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={createAll} loading={pending} disabled={!rows || rows.length === 0}>
            Create {rows?.length ?? 0} variants
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function VariantEditor({ product }: { product: AdminProductDetail }) {
  const [single, setSingle] = useState<{ editing: AdminVariant | null } | null>(null);
  const [matrix, setMatrix] = useState(false);
  const variants = product.variants ?? [];

  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Variants &amp; SKUs</h2>
          <p className="label-mono normal-case text-ink-faint">{variants.length} variants</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setMatrix(true)}>
            Generate from options
          </Button>
          <Button size="sm" onClick={() => setSingle({ editing: null })}>
            <PlusIcon size={16} />
            Add variant
          </Button>
        </div>
      </div>

      {variants.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-soft">No variants yet. Add one, or generate a set from an option matrix.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">Variants for {product.name}</caption>
            <thead>
              <tr className="border-b border-line bg-surface-sunken">
                <th scope="col" className="label-mono px-5 py-2 text-left">SKU</th>
                <th scope="col" className="label-mono px-3 py-2 text-left">Name</th>
                <th scope="col" className="label-mono px-3 py-2 text-right">Price</th>
                <th scope="col" className="label-mono px-3 py-2 text-right">Avail</th>
                <th scope="col" className="label-mono px-3 py-2 text-right">Resv</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-2.5 font-mono uppercase text-ink">{v.sku}</td>
                  <td className="px-3 py-2.5 text-ink-soft">{v.name}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink">{formatPrice(v.price_cents, v.currency)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink">{v.available}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink-faint">{v.reserved ?? 0}</td>
                  <td className="px-3 py-2.5 text-right">
                    <IconButton label={`Edit ${v.sku}`} size="sm" onClick={() => setSingle({ editing: v })}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {single && <SingleVariantModal product={product} editing={single.editing} onClose={() => setSingle(null)} />}
      {matrix && <MatrixModal product={product} onClose={() => setMatrix(false)} />}
    </section>
  );
}
