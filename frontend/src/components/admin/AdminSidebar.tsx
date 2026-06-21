import { useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useDashboard } from '@/hooks/admin/useDashboard';
import { ADMIN_NAV } from './nav';
import { CloseIcon } from './icons';

function NavCount({ kind }: { kind: 'low_stock' | 'orders' }) {
  const { data } = useDashboard();
  if (!data) return null;
  const value = kind === 'low_stock' ? data.kpis.low_stock_count : data.kpis.orders_count;
  if (!value) return null;
  const danger = kind === 'low_stock';
  return (
    <span
      className={cn(
        'ml-auto rounded-full px-1.5 py-0.5 font-mono text-2xs tabular-nums',
        danger ? 'bg-stock-out-bg text-stock-out-ink' : 'bg-surface-sunken text-ink-faint',
      )}
    >
      {value}
    </span>
  );
}

/** The nav list — shared by the desktop rail and the mobile drawer. */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="后台导航" className="flex flex-col gap-0.5 p-3">
      {ADMIN_NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive',
                isActive
                  ? 'bg-accent-soft text-accent-ink'
                  : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            <span>{item.label}</span>
            {item.count && <NavCount kind={item.count} />}
          </NavLink>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link to="/admin" className="flex items-center gap-2 px-4 py-4" aria-label="NanoCrate admin, dashboard">
      <span className="flex h-7 w-7 items-center justify-center rounded bg-ink font-mono text-sm font-bold text-ink-invert">N</span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-tight text-ink">NanoCrate</span>
        <span className="label-mono mt-0.5 text-2xs text-ink-faint">// 后台</span>
      </span>
    </Link>
  );
}

/** Static rail (desktop ≥ lg). */
export function AdminSidebarRail() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="sticky top-0 flex h-dvh flex-col">
        <Brand />
        <div className="border-t border-line" />
        <SidebarNav />
        <p className="mt-auto px-4 py-4 text-2xs text-ink-faint">
          模拟数据 · §9.5(提案)
        </p>
      </div>
    </aside>
  );
}

/** Off-canvas drawer (narrow screens). Focus-trapped, Esc to close. */
export function AdminSidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>('a, button')?.focus();
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? items.indexOf(active) : -1;
      if (idx === -1) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <div className="lg:hidden" aria-hidden={!open}>
      <div
        className={cn(
          'fixed inset-0 z-[var(--z-overlay)] bg-ink/50 transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="后台导航"
        className={cn(
          'fixed inset-y-0 left-0 z-[var(--z-overlay)] flex w-72 max-w-[80%] flex-col bg-surface shadow-lift transition-transform duration-300 ease-out-expo',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-line pr-2">
          <Brand />
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭导航"
            className="rounded-md p-2 text-ink-soft hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
          >
            <CloseIcon size={20} />
          </button>
        </div>
        <SidebarNav onNavigate={onClose} />
      </div>
    </div>
  );
}
