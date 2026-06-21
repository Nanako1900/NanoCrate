import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: ReactNode;
}

/** Editorial page header (mono eyebrow + title + hairline rule) so the cart /
 *  checkout / orders surfaces share the catalog's spec-sheet voice. */
export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="border-b border-line pb-5">
      <p className="label-mono">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      {description && <p className="mt-2 max-w-prose text-ink-soft">{description}</p>}
    </header>
  );
}
