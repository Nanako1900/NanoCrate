import { Link } from 'react-router-dom';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { BarChart, LineChart } from '@/components/admin/Charts';
import { OrderStatusBadge } from '@/components/order/OrderStatusBadge';
import { ErrorState } from '@/components/ui/ErrorState';
import { useDashboard } from '@/hooks/admin/useDashboard';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { DashboardData } from '@/services/admin-types';

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn('rounded-lg border border-line bg-surface p-5', className)}>{children}</section>;
}

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  /** The ★ concurrency metric gets a distinct, attention-drawing frame. */
  flagship?: boolean;
  danger?: boolean;
}

function Kpi({ label, value, hint, flagship, danger }: KpiProps) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        flagship ? 'border-accent/40 bg-accent-soft/40' : 'border-line bg-surface',
      )}
    >
      <p className="label-mono normal-case text-ink-faint">{label}</p>
      <p className={cn('mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight', danger && value !== '0' ? 'text-stock-out-ink' : 'text-ink')}>
        {value}
      </p>
      {hint && <p className="mt-1 text-2xs text-ink-faint">{hint}</p>}
    </div>
  );
}

function DashboardBody({ data }: { data: DashboardData }) {
  const k = data.kpis;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Revenue (paid)" value={formatPrice(k.revenue_cents)} hint="last 30 days" />
        <Kpi label="Orders" value={String(k.orders_count)} hint="all statuses" />
        <Kpi label="Conversion" value={`${(k.conversion_rate * 100).toFixed(1)}%`} hint="visits → orders" />
        <Kpi label="Low stock" value={String(k.low_stock_count)} hint="at or below threshold" danger />
        <Kpi label="Stock conflicts" value={String(k.stock_conflict_count)} hint="oversells the saga blocked ★" flagship danger />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-ink">Order trend</h2>
          <p className="label-mono normal-case text-ink-faint">14-day volume</p>
          <div className="mt-3 text-interactive">
            <LineChart label="Orders per day over the last 14 days" data={data.order_trend.map((t) => ({ date: t.date, value: t.orders }))} />
          </div>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-ink">Top sellers</h2>
          <p className="label-mono normal-case text-ink-faint">units sold</p>
          <div className="mt-3">
            <BarChart label="Top selling variants by units" data={data.top_sellers.map((s) => ({ label: s.name, value: s.units }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ink">Recent orders</h2>
            <Link to="/admin/orders" className="text-2xs text-interactive hover:underline">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {data.recent_orders.map((o) => (
              <li key={o.id}>
                <Link to={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken">
                  <span className="label-mono normal-case text-ink">{o.id}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{o.customer_email}</span>
                  <OrderStatusBadge status={o.status} />
                  <span className="font-mono text-sm tabular-nums text-ink">{formatPrice(o.total_cents, o.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ink">Low stock</h2>
            <Link to="/admin/inventory" className="text-2xs text-interactive hover:underline">
              Manage
            </Link>
          </div>
          {data.low_stock.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-soft">Everything’s well stocked.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.low_stock.map((row) => (
                <li key={row.variant_id} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{row.product_name}</span>
                    <span className="label-mono normal-case text-ink-faint">{row.sku}</span>
                  </span>
                  <span className={cn('font-mono text-sm tabular-nums', row.available === 0 ? 'text-stock-out-ink' : 'text-stock-low-ink')}>
                    {row.available} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export function AdminDashboardPage() {
  const query = useDashboard();
  return (
    <>
      <AdminPageHeader breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Dashboard' }]} title="Dashboard" description="Store health at a glance." />
      {query.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-line bg-surface-sunken" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data ? (
        <DashboardBody data={query.data} />
      ) : null}
    </>
  );
}
