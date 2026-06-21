import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Button, buttonClasses } from '@/components/ui/Button';

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
 * `admin` role; otherwise renders a dedicated state — sign-in when anonymous, a
 * no-permission notice when signed in without the role. Also scopes the indigo
 * admin skin + zh-CN language to the whole /admin tree (gate, lazy-shell load,
 * and console), restoring the storefront warm/English on leave.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { status, isAuthenticated, isAdmin, login, logout, mode, user } = useAuth();

  useEffect(() => {
    const el = document.documentElement;
    const prevLang = el.lang;
    el.dataset.skin = 'admin';
    el.lang = 'zh-CN';
    return () => {
      delete el.dataset.skin;
      el.lang = prevLang || 'en';
    };
  }, []);

  if (status === 'loading') {
    return (
      <Gate>
        <p className="label-mono text-ink-faint" role="status">
          正在校验权限…
        </p>
      </Gate>
    );
  }

  if (!isAuthenticated) {
    return (
      <Gate>
        <p className="label-mono text-2xs uppercase tracking-[0.08em] text-ink-faint">后台 · 受限</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">登录管理后台</h1>
        <p className="mt-2 text-ink-soft">NanoCrate 管理后台需要具备 admin 角色的账户。</p>
        <Button onClick={() => login({ admin: true })} className="mt-5 w-full">
          {mode === 'mock' ? '以管理员登录(演示)' : '登录'}
        </Button>
        {mode === 'mock' && (
          <p className="mt-3 text-2xs text-ink-faint">模拟模式 · 即时演示管理员会话,无需真实凭据。</p>
        )}
        <Link to="/" className="mt-4 inline-block text-sm text-interactive hover:underline">
          ← 返回店面
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
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">无后台权限</h1>
        <p className="mt-2 text-ink-soft">
          当前登录为 <span className="font-medium text-ink">{user?.email}</span>,不具备 admin 角色。请切换到管理员账户继续。
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {mode === 'mock' && (
            <Button onClick={() => login({ admin: true })} className="w-full">
              切换到管理员(演示)
            </Button>
          )}
          <button type="button" onClick={logout} className={buttonClasses('secondary', 'md', 'w-full')}>
            退出登录
          </button>
          <Link to="/" className="mt-1 text-sm text-interactive hover:underline">
            ← 返回店面
          </Link>
        </div>
      </Gate>
    );
  }

  return <>{children}</>;
}
