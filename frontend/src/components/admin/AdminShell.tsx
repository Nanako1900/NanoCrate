import { lazy, Suspense, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/ToastContext';
import { AdminSidebarDrawer, AdminSidebarRail } from './AdminSidebar';
import { AdminTopBar } from './AdminTopBar';

const CommandPalette = lazy(() => import('./CommandPalette'));

/** Admin layout: persistent rail (desktop) / drawer (mobile), top bar, and the
 *  routed page in <Outlet>. Owns the mobile-nav + ⌘K command-palette state. */
export function AdminShell() {
  const [navOpen, setNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only rounded-md bg-ink px-4 py-2 text-ink-invert focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[var(--z-overlay)]"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh bg-paper text-ink">
        <AdminSidebarRail />
        <AdminSidebarDrawer open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopBar onOpenNav={() => setNavOpen(true)} onOpenCommand={() => setCmdOpen(true)} />
          <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[84rem]">
              <Suspense
                fallback={
                  <p className="label-mono py-20 text-center text-ink-faint" role="status">
                    Loading…
                  </p>
                }
              >
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
      {cmdOpen && (
        <Suspense fallback={null}>
          <CommandPalette open onClose={() => setCmdOpen(false)} />
        </Suspense>
      )}
    </ToastProvider>
  );
}
