import { useMemo, useState, type ComponentType, type SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/components/theme/ThemeContext';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/cn';
import { ADMIN_NAV } from './nav';
import { PlusIcon, SearchIcon } from './icons';

interface Command {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  run: () => void;
}

/** ⌘K command palette. Combobox semantics: focus stays on the input, arrows move
 *  the active option (aria-activedescendant), Enter runs it. Code-split via the
 *  shell's lazy import so it never weighs on first paint. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { logout } = useAuth();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      onClose();
      navigate(to);
    };
    return [
      ...ADMIN_NAV.map((item) => ({
        id: `nav-${item.to}`,
        label: `前往${item.label}`,
        hint: item.to,
        keywords: item.label,
        icon: item.icon,
        run: go(item.to),
      })),
      { id: 'new-product', label: '新建商品', hint: 'new', keywords: 'add product create', icon: PlusIcon, run: go('/admin/products/new') },
      { id: 'view-store', label: '查看店面', keywords: 'shop store front', icon: SearchIcon, run: go('/') },
      {
        id: 'toggle-theme',
        label: `切换到${theme === 'dark' ? '浅色' : '深色'}主题`,
        keywords: 'theme dark light mode',
        icon: SearchIcon,
        run: () => {
          toggle();
          onClose();
        },
      },
      {
        id: 'sign-out',
        label: '退出登录',
        keywords: 'logout exit',
        icon: SearchIcon,
        run: () => {
          onClose();
          logout();
        },
      },
    ];
  }, [navigate, onClose, theme, toggle, logout]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.keywords ?? ''} ${c.hint ?? ''}`.toLowerCase().includes(q));
  }, [commands, query]);

  const clampedActive = Math.min(active, Math.max(0, filtered.length - 1));

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[clampedActive]?.run();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="命令面板" bare size="md" panelClassName="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4">
        <SearchIcon size={18} className="shrink-0 text-ink-faint" />
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={filtered[clampedActive] ? `command-${filtered[clampedActive].id}` : undefined}
          aria-label="搜索命令"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="输入命令或搜索…"
          className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
        <kbd className="hidden rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-ink-faint sm:inline">esc</kbd>
      </div>
      <ul id="command-list" role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-ink-faint">没有匹配“{query}”的命令。</li>
        ) : (
          filtered.map((cmd, i) => {
            const Icon = cmd.icon;
            const isActive = i === clampedActive;
            return (
              <li key={cmd.id} id={`command-${cmd.id}`} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={cmd.run}
                  onMouseMove={() => setActive(i)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink',
                  )}
                >
                  <Icon size={16} className="shrink-0 opacity-70" />
                  <span className="flex-1 truncate">{cmd.label}</span>
                  {cmd.hint && <span className="label-mono normal-case text-ink-faint">{cmd.hint}</span>}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </Modal>
  );
}

export default CommandPalette;
