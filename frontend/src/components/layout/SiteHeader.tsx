import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useProductTypes } from '@/hooks/useProducts';
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
      <div className="container-page flex h-16 items-center gap-3">
        <Link to="/" className="flex items-baseline gap-2" aria-label="NanoCrate, home">
          <span className="text-lg font-bold tracking-tight text-ink">NanoCrate</span>
          <span className="hidden font-mono text-2xs uppercase tracking-[0.2em] text-ink-faint sm:inline">
            // keebs
          </span>
        </Link>

        <nav aria-label="Product categories" className="ml-2 hidden items-center gap-1 md:flex">
          <CategoryLink to="/" active={!activeType}>
            All
          </CategoryLink>
          {types?.map((type) => (
            <CategoryLink key={type.key} to={`/?type=${type.key}`} active={activeType === type.key}>
              {type.name}
            </CategoryLink>
          ))}
        </nav>

        <form role="search" onSubmit={onSubmit} className="ml-auto flex items-center gap-1.5">
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
            className="h-9 w-32 rounded-md border border-line bg-surface px-3 text-sm text-ink transition-colors duration-150 placeholder:text-ink-faint hover:border-line-strong focus:border-interactive sm:w-52"
          />
          <button
            type="submit"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-soft transition-[transform,background-color,border-color,color] duration-150 ease-out hover:border-line-strong hover:text-ink active:translate-y-px"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span className="sr-only">Search</span>
          </button>
        </form>
      </div>
    </header>
  );
}
