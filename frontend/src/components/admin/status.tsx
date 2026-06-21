import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { OrderStatus, PaymentStatus } from '@/services/types';
import type { LedgerKind, ProductStatus } from '@/services/admin-types';

/**
 * Admin-only (Simplified Chinese) status badges + label maps. Kept separate
 * from the storefront's OrderStatusBadge so the English storefront is unaffected.
 */

const ORDER_TONE: Record<OrderStatus, BadgeTone> = { pending: 'low', paid: 'in', fulfilled: 'in', failed: 'out', cancelled: 'out' };
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '待支付',
  paid: '已支付',
  fulfilled: '已履约',
  failed: '失败',
  cancelled: '已取消',
};

export function AdminOrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge tone={ORDER_TONE[status]} mono className={className}>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

const PRODUCT_TONE: Record<ProductStatus, BadgeTone> = { active: 'in', draft: 'low', archived: 'neutral' };
export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  active: '上架',
  draft: '草稿',
  archived: '已归档',
};

export function AdminProductStatusBadge({ status }: { status: ProductStatus }) {
  return (
    <Badge tone={PRODUCT_TONE[status]} mono>
      {PRODUCT_STATUS_LABEL[status]}
    </Badge>
  );
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  requires_payment: '待支付',
  succeeded: '成功',
  failed: '失败',
};

export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  reserve: '预留',
  commit: '提交',
  release: '释放',
  expire: '过期',
  restock: '补货',
};
