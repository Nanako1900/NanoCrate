import { Badge } from './Badge';

interface StockIndicatorProps {
  available: number;
  threshold?: number;
  className?: string;
}

/** Maps an availability count to a designed, semantic stock badge. */
export function StockIndicator({ available, threshold = 5, className }: StockIndicatorProps) {
  if (available <= 0) {
    return (
      <Badge tone="out" mono className={className}>
        Out of stock
      </Badge>
    );
  }
  if (available <= threshold) {
    return (
      <Badge tone="low" mono className={className}>
        Low · {available} left
      </Badge>
    );
  }
  return (
    <Badge tone="in" mono className={className}>
      In stock
    </Badge>
  );
}
