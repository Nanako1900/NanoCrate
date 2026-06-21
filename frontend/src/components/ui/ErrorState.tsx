import { ApiError } from '@/services/api';
import { Button } from './Button';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }: ErrorStateProps) {
  const code = error instanceof ApiError ? error.code : null;
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-stock-out-ink/30 bg-stock-out-bg px-6 py-12 text-center"
    >
      {code && <p className="label-mono text-2xs uppercase tracking-[0.08em] text-stock-out-ink">{code}</p>}
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <p className="text-ink-soft">{toMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}
