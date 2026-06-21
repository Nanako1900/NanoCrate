import type { OrderStatus } from '@/services/types';
import { Badge, type BadgeTone } from '@/components/ui/Badge';

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending: 'low',
  paid: 'in',
  fulfilled: 'in',
  failed: 'out',
  cancelled: 'out',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  fulfilled: 'Fulfilled',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} mono className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
