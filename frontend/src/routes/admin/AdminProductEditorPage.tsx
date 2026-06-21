import { useParams } from 'react-router-dom';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

export function AdminProductEditorPage() {
  const { id } = useParams();
  return (
    <>
      <AdminPageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Products', to: '/admin/products' }, { label: id ? 'Edit' : 'New' }]}
        title={id ? 'Edit product' : 'New product'}
      />
      <p className="text-ink-soft">Coming up next.</p>
    </>
  );
}
