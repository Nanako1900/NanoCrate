import type { ComponentType, SVGProps } from 'react';
import { DashboardIcon, InventoryIcon, OrdersIcon, ProductsIcon, SettingsIcon } from './icons';

export interface AdminNavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** match exactly (Dashboard is the index route). */
  end?: boolean;
  /** which dashboard KPI feeds the mono count badge, if any. */
  count?: 'low_stock' | 'orders';
}

export const ADMIN_NAV: AdminNavItem[] = [
  { to: '/admin', label: '仪表盘', icon: DashboardIcon, end: true },
  { to: '/admin/products', label: '商品', icon: ProductsIcon },
  { to: '/admin/inventory', label: '库存', icon: InventoryIcon, count: 'low_stock' },
  { to: '/admin/orders', label: '订单', icon: OrdersIcon, count: 'orders' },
  { to: '/admin/settings', label: '设置', icon: SettingsIcon },
];
