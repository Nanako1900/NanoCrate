import { Link } from 'react-router-dom';
import { buttonClasses } from '@/components/ui/Button';

interface NotFoundPageProps {
  title?: string;
}

export function NotFoundPage({ title = 'Page not found' }: NotFoundPageProps) {
  return (
    <div className="container-page flex flex-col items-center gap-4 py-24 text-center">
      <p className="label-mono text-2xs">404</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="max-w-md text-ink-soft">
        The page you’re looking for doesn’t exist or has moved.
      </p>
      <Link to="/" className={buttonClasses('primary', 'md', 'mt-2')}>
        Back to catalog
      </Link>
    </div>
  );
}
