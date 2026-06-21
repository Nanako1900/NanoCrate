import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

interface ProductGridSkeletonProps {
  count?: number;
  featureFirst?: boolean;
}

export function ProductGridSkeleton({ count = 9, featureFirst = false }: ProductGridSkeletonProps) {
  return (
    <ul
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
      data-testid="product-grid-skeleton"
    >
      {Array.from({ length: count }).map((_, index) => (
        <li key={index} className={cn('flex', featureFirst && index === 0 && 'sm:col-span-2')}>
          <div className="w-full overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-2/3" />
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-5 w-12" />
              </div>
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
