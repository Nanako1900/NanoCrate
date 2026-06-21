import { Skeleton } from '@/components/ui/Skeleton';

export function ProductDetailSkeleton() {
  return (
    <div className="container-page py-8 lg:py-12" role="status" aria-label="Loading product">
      <Skeleton className="mb-6 h-4 w-48" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        <Skeleton className="aspect-[4/3] w-full rounded-lg" />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-20 w-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
          <Skeleton className="h-12 w-56" />
        </div>
      </div>
      <span className="sr-only">Loading product details…</span>
    </div>
  );
}
