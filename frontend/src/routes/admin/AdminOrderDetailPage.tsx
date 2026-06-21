import { useParams } from 'react-router-dom';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminOrderStatusBadge, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '@/components/admin/status';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Spinner } from '@/components/ui/Spinner';
import { useAdminOrder } from '@/hooks/admin/useAdminOrders';
import { formatDate, formatPrice } from '@/lib/format';
import type { AdminOrderDetail } from '@/services/admin-types';
import type { PaymentStatus } from '@/services/types';

const PAYMENT_TONE: Record<PaymentStatus, BadgeTone> = { succeeded: 'in', requires_payment: 'low', failed: 'out' };

/** §9.5 admin order detail reuses the §9.4 shape (no server timeline). We derive
 *  a readable status trail client-side from the order's status + timestamp. */
function deriveTimeline(order: AdminOrderDetail): { status: string; note: string | null; at: string }[] {
  const at = order.created_at;
  const events: { status: string; note: string | null; at: string }[] = [
    { status: 'pending', note: '订单创建,库存已预留', at },
  ];
  if (order.status === 'paid' || order.status === 'fulfilled') events.push({ status: 'paid', note: '支付已确认(webhook)', at });
  if (order.status === 'fulfilled') events.push({ status: 'fulfilled', note: '已发货', at });
  if (order.status === 'failed') events.push({ status: 'failed', note: '支付失败', at });
  if (order.status === 'cancelled') events.push({ status: 'cancelled', note: '结算时库存不足,已退款', at });
  return events;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">{title}</h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Body({ order }: { order: AdminOrderDetail }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div className="flex flex-col gap-6">
        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">商品(下单快照)</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <caption className="sr-only">订单行项</caption>
              <thead>
                <tr className="border-b border-line bg-surface-sunken">
                  <th scope="col" className="label-mono px-5 py-2 text-left">SKU</th>
                  <th scope="col" className="label-mono px-3 py-2 text-left">名称</th>
                  <th scope="col" className="label-mono px-3 py-2 text-right">数量</th>
                  <th scope="col" className="label-mono px-3 py-2 text-right">单价</th>
                  <th scope="col" className="label-mono px-5 py-2 text-right">小计</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-2.5 font-mono uppercase text-ink">{it.sku}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{it.name}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink">{it.qty}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink-soft">{formatPrice(it.unit_price_cents, order.currency)}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-ink">{formatPrice(it.line_total_cents, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td colSpan={4} className="px-5 py-3 text-right text-sm text-ink-soft">合计</td>
                  <td className="px-5 py-3 text-right font-mono text-base font-semibold tabular-nums text-ink">{formatPrice(order.total_cents, order.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-6">
        <Card title="客户">
          <p className="label-mono normal-case text-ink-faint">用户</p>
          <p className="mt-0.5 break-all font-mono text-sm text-ink">{order.user_id ?? '—'}</p>
        </Card>

        <Card title="支付">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-ink-faint">渠道</dt>
            <dd className="text-right capitalize text-ink">{order.payment.provider}</dd>
            <dt className="text-ink-faint">状态</dt>
            <dd className="text-right">
              <Badge tone={PAYMENT_TONE[order.payment.status]} mono>
                {PAYMENT_STATUS_LABEL[order.payment.status]}
              </Badge>
            </dd>
          </dl>
        </Card>

        <Card title="状态时间线">
          <ol className="flex flex-col gap-0">
            {deriveTimeline(order).map((event, i, arr) => {
              const last = i === arr.length - 1;
              return (
                <li key={i} className="grid grid-cols-[auto_1fr] gap-x-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
                    {!last && <span className="w-px flex-1 bg-line" aria-hidden="true" />}
                  </div>
                  <div className={last ? '' : 'pb-4'}>
                    <p className="text-sm font-medium capitalize text-ink">{ORDER_STATUS_LABEL[event.status as keyof typeof ORDER_STATUS_LABEL] ?? event.status}</p>
                    {event.note && <p className="text-xs text-ink-soft">{event.note}</p>}
                    <p className="label-mono mt-0.5 normal-case text-ink-faint">{formatDate(event.at)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </div>
  );
}

export function AdminOrderDetailPage() {
  const { id } = useParams();
  const query = useAdminOrder(id ?? '');

  return (
    <>
      <AdminPageHeader
        breadcrumbs={[{ label: '后台', to: '/admin' }, { label: '订单', to: '/admin/orders' }, { label: id ?? '订单' }]}
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{id}</span>
            {query.data && <AdminOrderStatusBadge status={query.data.status} />}
          </span>
        }
        description={query.data ? `下单于 ${formatDate(query.data.created_at)}` : undefined}
        actions={
          <div className="flex gap-2" title="本版本的履约操作为占位">
            <Button variant="secondary" size="sm" disabled>
              履约
            </Button>
            <Button variant="secondary" size="sm" disabled>
              退款
            </Button>
          </div>
        }
      />
      {query.isLoading ? (
        <div className="flex justify-center py-20 text-ink-faint">
          <Spinner size={28} label="正在加载订单" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="订单不存在" />
      ) : query.data ? (
        <Body order={query.data} />
      ) : null}
    </>
  );
}
