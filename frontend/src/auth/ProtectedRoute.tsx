import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { Button } from '@/components/ui/Button';

interface ProtectedRouteProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

/** Gates a route behind auth. Unauthenticated users get an in-place sign-in
 *  panel (mock = instant demo login; live = redirect to Keycloak). */
export function ProtectedRoute({
  children,
  title = 'Sign in to continue',
  description = 'You need to be signed in to view this page.',
}: ProtectedRouteProps) {
  const { status, login, mode } = useAuth();

  if (status === 'loading') {
    return (
      <div className="container-page py-20 text-center" role="status" aria-label="Checking your session">
        <p className="label-mono text-ink-faint">Checking session…</p>
      </div>
    );
  }

  if (status === 'authenticated') {
    return <>{children}</>;
  }

  return (
    <div className="container-page py-20">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-lg border border-line bg-surface px-6 py-12 text-center shadow-sm">
        <p className="label-mono text-2xs uppercase tracking-[0.08em] text-ink-faint">Account required</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="text-ink-soft">{description}</p>
        <Button onClick={login} className="mt-2 w-full sm:w-auto sm:min-w-48">
          Sign in
        </Button>
        {mode === 'mock' && (
          <p className="text-2xs text-ink-faint">Mock mode · instant demo sign-in, no real credentials.</p>
        )}
      </div>
    </div>
  );
}
