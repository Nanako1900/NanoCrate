import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

export function AdminInventoryPage() {
  return (
    <>
      <AdminPageHeader breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Inventory' }]} title="Inventory" />
      <p className="text-ink-soft">Coming up next.</p>
    </>
  );
}
