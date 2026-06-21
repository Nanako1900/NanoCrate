import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { apiMode } from '@/lib/env';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { MenuIcon, SearchIcon } from './icons';

function EnvBadge() {
  const isMock = apiMode === 'mock';
  return (
    <Badge tone={isMock ? 'accent' : 'in'} mono className="hidden sm:inline-flex">
      {isMock ? 'mock' : 'live'}
    </Badge>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const items = () => Array.from(details.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
    function onToggle() {
      if (details!.open) items()[0]?.focus();
    }
    function onDocClick(e: MouseEvent) {
      if (details!.open && !details!.contains(e.target as Node)) details!.open = false;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (!details!.open) return;
      if (e.key === 'Escape') {
        details!.open = false;
        details!.querySelector('summary')?.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? list.indexOf(active) : -1;
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
    details.addEventListener('toggle', onToggle);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      details.removeEventListener('toggle', onToggle);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  return (
    <details ref={ref} className="relative">
      <summary
        className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-line bg-surface px-2 text-sm text-ink hover:border-line-strong [&::-webkit-details-marker]:hidden"
        aria-label="账户菜单"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft font-mono text-2xs font-semibold text-accent-ink">
          {(user?.name ?? 'A').slice(0, 1)}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{user?.name}</span>
      </summary>
      <div className="absolute right-0 z-[var(--z-overlay)] mt-2 w-56 rounded-lg border border-line bg-surface p-2 shadow-lift">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
          {user?.email && <p className="label-mono mt-0.5 truncate normal-case">{user.email}</p>}
        </div>
        <Link to="/" onClick={close} className="block rounded-md px-2 py-2 text-sm text-ink transition-colors hover:bg-surface-sunken">
          查看店面
        </Link>
        <button
          type="button"
          onClick={() => {
            close();
            logout();
          }}
          className="block w-full rounded-md px-2 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-sunken"
        >
          退出登录
        </button>
      </div>
    </details>
  );
}

interface AdminTopBarProps {
  onOpenNav: () => void;
  onOpenCommand: () => void;
}

export function AdminTopBar({ onOpenNav, onOpenCommand }: AdminTopBarProps) {
  return (
    <header className="sticky top-0 z-[var(--z-header)] flex h-14 items-center gap-2 border-b border-line bg-paper/85 px-3 backdrop-blur sm:px-4">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="打开导航"
        className="rounded-md p-2 text-ink-soft hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive lg:hidden"
      >
        <MenuIcon size={20} />
      </button>

      <button
        type="button"
        onClick={onOpenCommand}
        className={cn(
          'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3 text-left text-sm text-ink-faint',
          'transition-colors hover:border-line-strong sm:max-w-sm',
        )}
        aria-label="打开命令面板并搜索"
      >
        <SearchIcon size={16} className="shrink-0" />
        <span className="truncate">搜索或跳转…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-ink-faint sm:inline">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <EnvBadge />
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}
