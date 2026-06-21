import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

export function AdminOrdersPage() {
  return (
    <>
      <AdminPageHeader breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Orders' }]} title="Orders" />
      <p className="text-ink-soft">Coming up next.</p>
    </>
  );
}
