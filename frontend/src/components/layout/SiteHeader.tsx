import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useProductTypes } from '@/hooks/useProducts';
import { useCart } from '@/hooks/useCart';
import { useCartUI } from '@/components/cart/CartUIContext';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/cn';

interface CategoryLinkProps {
  to: string;
  active: boolean;
  children: ReactNode;
}

function CategoryLink({ to, active, children }: CategoryLinkProps) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm transition-colors duration-150',
        active ? 'bg-accent-soft text-accent-ink' : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
      )}
    >
      {children}
    </Link>
  );
}

const iconBtn =
  'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-soft transition-[transform,background-color,border-color,color] duration-150 ease-out hover:border-line-strong hover:text-ink active:translate-y-px';

function CartButton() {
  const { open } = useCartUI();
  const { data: cart } = useCart();
  const count = cart?.item_count ?? 0;
  return (
    <button type="button" onClick={open} className={iconBtn} aria-label={`Open cart, ${count} ${count === 1 ? 'item' : 'items'}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 6h15l-1.5 9h-12z" />
        <path d="M6 6 5 3H3" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-accent px-1 font-mono text-[0.625rem] font-semibold leading-4 text-accent-ink">
          {count}
        </span>
      )}
    </button>
  );
}

function AccountMenu() {
  const { status, user, login, logout } = useAuth();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Close the disclosure on Escape (refocusing the trigger) or an outside click.
  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    function onDocClick(event: MouseEvent) {
      if (details && details.open && !details.contains(event.target as Node)) {
        details.open = false;
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && details && details.open) {
        details.open = false;
        details.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [status]);

  if (status !== 'authenticated') {
    return (
      <button
        type="button"
        onClick={login}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-sm text-ink transition-[transform,background-color,border-color,color] duration-150 ease-out hover:border-line-strong active:translate-y-px sm:px-3"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
        <span className="hidden sm:inline">Sign in</span>
        <span className="sr-only">Sign in</span>
      </button>
    );
  }

  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };

  return (
    <details ref={detailsRef} className="relative">
      <summary className={cn(iconBtn, 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')} aria-label="Account menu">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      </summary>
      <div className="absolute right-0 z-[var(--z-overlay)] mt-2 w-56 rounded-lg border border-line bg-surface p-2 shadow-lift">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
          {user?.email && <p className="label-mono mt-0.5 truncate">{user.email}</p>}
        </div>
        <Link
          to="/orders"
          onClick={close}
          className="block rounded-md px-2 py-2 text-sm text-ink transition-colors hover:bg-surface-sunken"
        >
          Orders
        </Link>
        <button
          type="button"
          onClick={() => {
            close();
            logout();
          }}
          className="block w-full rounded-md px-2 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-sunken"
        >
          Sign out
        </button>
      </div>
    </details>
  );
}

export function SiteHeader() {
  const { data: types } = useProductTypes();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeType = searchParams.get('type');
  const [term, setTerm] = useState('');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = term.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : '/');
  }

  return (
    <header className="sticky top-0 z-[var(--z-header)] border-b border-line bg-paper/85 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-2 sm:gap-3">
        <Link to="/" className="flex shrink-0 items-baseline gap-2" aria-label="NanoCrate, home">
          <span className="text-lg font-bold tracking-tight text-ink">NanoCrate</span>
          <span className="hidden font-mono text-2xs uppercase tracking-[0.2em] text-ink-faint lg:inline">
            // keebs
          </span>
        </Link>

        <nav aria-label="Product categories" className="ml-2 hidden items-center gap-1 lg:flex">
          <CategoryLink to="/" active={!activeType}>
            All
          </CategoryLink>
          {types?.map((type) => (
            <CategoryLink key={type.key} to={`/?type=${type.key}`} active={activeType === type.key}>
              {type.name}
            </CategoryLink>
          ))}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          <form role="search" onSubmit={onSubmit} className="flex min-w-0 items-center gap-1.5">
            <label htmlFor="site-search" className="sr-only">
              Search keyboards
            </label>
            <input
              id="site-search"
              name="q"
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search…"
              className="h-9 w-24 min-w-0 rounded-md border border-line bg-surface px-3 text-sm text-ink transition-colors duration-150 placeholder:text-ink-faint hover:border-line-strong focus:border-interactive sm:w-44"
            />
            <button type="submit" className={cn(iconBtn, 'hidden sm:inline-flex')}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <span className="sr-only">Search</span>
            </button>
          </form>
          <CartButton />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
