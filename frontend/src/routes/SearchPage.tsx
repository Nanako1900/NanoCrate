import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSearch } from '@/hooks/useSearch';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { SearchHit } from '@/services/types';

const EXAMPLES = [
  'quiet office full-size hot-swappable',
  'wireless 65% aluminum',
  'linear red switches for gaming',
  'tenkeyless brown tactile',
];

function RelevanceBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
        <div className="h-full rounded-full bg-interactive" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-2xs tabular-nums text-ink-faint">{pct}%</span>
    </div>
  );
}

function HitRow({ hit, rank }: { hit: SearchHit; rank: number }) {
  return (
    <li>
      <Link
        to={`/p/${hit.slug}`}
        className="group flex items-center gap-4 rounded-lg border border-line bg-surface px-4 py-3 transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-px hover:border-line-strong hover:shadow-md"
      >
        <span className="label-mono w-6 shrink-0 text-ink-faint">{String(rank).padStart(2, '0')}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{hit.name}</span>
          <span className="label-mono normal-case text-ink-faint">{hit.slug}</span>
        </span>
        <span className="hidden sm:block">
          <RelevanceBar score={hit.score} />
        </span>
        <svg className="shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Link>
    </li>
  );
}

function Suggestions({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {EXAMPLES.map((ex) => (
        <button
          key={ex}
          type="button"
          onClick={() => onPick(ex)}
          className="rounded-pill border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft transition-colors duration-150 hover:border-line-strong hover:text-ink"
        >
          {ex}
        </button>
      ))}
    </div>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [term, setTerm] = useState(query);
  useEffect(() => setTerm(query), [query]);

  const { data, isLoading, isError, error, refetch, isFetching } = useSearch(query);
  const hits = data?.hits ?? [];

  function submit(next: string) {
    const q = next.trim();
    setParams(q ? { q } : {}, { replace: false });
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(term);
  }

  return (
    <div className="container-page py-8 lg:py-12">
      <PageHeader
        eyebrow="Semantic search"
        title="Describe what you’re after"
        description="Plain language works — “a quiet full-size board for the office”. Results blend meaning and keywords."
      />

      <form role="search" onSubmit={onSubmit} className="mt-6 flex gap-2">
        <label htmlFor="semantic-q" className="sr-only">
          Search keyboards
        </label>
        <input
          id="semantic-q"
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="quiet, office, full-size, hot-swappable…"
          autoComplete="off"
          className="h-12 min-w-0 flex-1 rounded-md border border-line bg-surface px-4 text-base text-ink transition-colors duration-150 placeholder:text-ink-faint hover:border-line-strong focus:border-interactive"
        />
        <button type="submit" className={buttonClasses('primary', 'md', 'h-12 px-5')}>
          Search
        </button>
      </form>

      <div className="mt-8" aria-live="polite">
        {!query ? (
          <div className="flex flex-col gap-4">
            <p className="label-mono text-ink-faint">Try one of these</p>
            <Suggestions onPick={(q) => submit(q)} />
          </div>
        ) : isLoading ? (
          <ul className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-[58px] w-full rounded-lg" />
              </li>
            ))}
          </ul>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} title="Search is unavailable" />
        ) : hits.length === 0 ? (
          <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-line bg-surface px-6 py-10">
            <div>
              <p className="label-mono text-2xs uppercase tracking-[0.08em] text-ink-faint">No matches</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">Nothing matched “{query}”</h2>
              <p className="mt-1 text-ink-soft">Try fewer or different words, or start from one of these:</p>
            </div>
            <Suggestions onPick={(q) => submit(q)} />
            <Link to="/" className={buttonClasses('secondary', 'sm')}>
              Browse the full catalog
            </Link>
          </div>
        ) : (
          <>
            <p className={cn('label-mono mb-3 text-ink-faint', isFetching && 'opacity-60')}>
              <span className="tabular-nums text-ink">{hits.length}</span> matches for “{query}”
            </p>
            <ol className="flex flex-col gap-2">
              {hits.map((hit, i) => (
                <HitRow key={hit.slug} hit={hit} rank={i + 1} />
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
