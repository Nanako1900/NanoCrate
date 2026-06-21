import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

export function AdminDashboardPage() {
  return (
    <>
      <AdminPageHeader breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Dashboard' }]} title="Dashboard" />
      <p className="text-ink-soft">Coming up next.</p>
    </>
  );
}
