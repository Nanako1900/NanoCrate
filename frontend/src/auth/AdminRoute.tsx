import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/Button';

function Gate({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-8 text-center shadow-sm">
        {children}
      </div>
    </div>
  );
}

/**
 * Admin route guard (RBAC). Requires an authenticated session carrying the
 * `admin` role; otherwise renders a dedicated state — sign-in when anonymous,
 * a no-permission notice when signed in without the role.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { status, isAuthenticated, isAdmin, login, logout, mode, user } = useAuth();

  if (status === 'loading') {
    return (
      <Gate>
        <p className="label-mono text-ink-faint" role="status">
          Checking access…
        </p>
      </Gate>
    );
  }

  if (!isAuthenticated) {
    return (
      <Gate>
        <p className="label-mono text-2xs uppercase tracking-[0.08em] text-ink-faint">Admin · restricted</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Sign in to the console</h1>
        <p className="mt-2 text-ink-soft">The NanoCrate admin console requires an account with the admin role.</p>
        <Button onClick={() => login({ admin: true })} className="mt-5 w-full">
          {mode === 'mock' ? 'Sign in as admin (demo)' : 'Sign in'}
        </Button>
        {mode === 'mock' && (
          <p className="mt-3 text-2xs text-ink-faint">Mock mode · instant demo admin session, no real credentials.</p>
        )}
        <Link to="/" className="mt-4 inline-block text-sm text-interactive hover:underline">
          ← Back to the store
        </Link>
      </Gate>
    );
  }

  if (!isAdmin) {
    return (
      <Gate>
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stock-out-bg text-stock-out-ink">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">No admin access</h1>
        <p className="mt-2 text-ink-soft">
          You’re signed in as <span className="font-medium text-ink">{user?.email}</span>, which doesn’t have
          the admin role. Switch to an admin account to continue.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {mode === 'mock' && (
            <Button onClick={() => login({ admin: true })} className="w-full">
              Switch to admin (demo)
            </Button>
          )}
          <button
            type="button"
            onClick={logout}
            className={buttonClasses('secondary', 'md', 'w-full')}
          >
            Sign out
          </button>
          <Link to="/" className="mt-1 text-sm text-interactive hover:underline">
            ← Back to the store
          </Link>
        </div>
      </Gate>
    );
  }

  return <>{children}</>;
}
