import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

export function AdminProductsPage() {
  return (
    <>
      <AdminPageHeader breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Products' }]} title="Products" />
      <p className="text-ink-soft">Coming up next.</p>
    </>
  );
}
