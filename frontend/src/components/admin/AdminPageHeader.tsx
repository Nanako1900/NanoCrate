import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon } from './icons';

export interface Crumb {
  label: string;
  to?: string;
}

interface AdminPageHeaderProps {
  breadcrumbs: Crumb[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

/** Breadcrumb trail + page title + right-aligned actions. */
export function AdminPageHeader({ breadcrumbs, title, description, actions }: AdminPageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-2xs">
          {breadcrumbs.map((crumb, i) => {
            const last = i === breadcrumbs.length - 1;
            return (
              <Fragment key={`${crumb.label}-${i}`}>
                <li>
                  {crumb.to && !last ? (
                    <Link to={crumb.to} className="label-mono normal-case text-ink-faint transition-colors hover:text-ink">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="label-mono normal-case text-ink-soft" aria-current={last ? 'page' : undefined}>
                      {crumb.label}
                    </span>
                  )}
                </li>
                {!last && (
                  <li aria-hidden="true" className="text-ink-faint">
                    <ChevronRightIcon size={12} />
                  </li>
                )}
              </Fragment>
            );
          })}
        </ol>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
