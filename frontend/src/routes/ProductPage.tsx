import { useParams } from 'react-router-dom';
import { useProduct } from '@/hooks/useProduct';
import { ApiError } from '@/services/api';
import { ProductDetail } from '@/components/product/ProductDetail';
import { ProductDetailSkeleton } from '@/components/product/ProductDetailSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { NotFoundPage } from './NotFoundPage';

export function ProductPage() {
  const { slug = '' } = useParams();
  const query = useProduct(slug);

  if (query.isLoading) {
    return <ProductDetailSkeleton />;
  }

  if (query.isError) {
    const code = query.error instanceof ApiError ? query.error.code : null;
    if (code === 'not_found') {
      return <NotFoundPage title="Product not found" />;
    }
    return (
      <div className="container-page py-16">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  if (!query.data) {
    return <NotFoundPage title="Product not found" />;
  }

  return <ProductDetail product={query.data} />;
}
