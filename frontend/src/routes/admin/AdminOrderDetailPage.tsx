import { useParams } from 'react-router-dom';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

export function AdminOrderDetailPage() {
  const { id } = useParams();
  return (
    <>
      <AdminPageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Orders', to: '/admin/orders' }, { label: id ?? 'Order' }]}
        title={`Order ${id ?? ''}`}
      />
      <p className="text-ink-soft">Coming up next.</p>
    </>
  );
}
