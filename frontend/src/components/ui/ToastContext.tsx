import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Auto-dismiss after ms; 0 keeps it until dismissed. Default 4500. */
  duration?: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-stock-in-ink/30 bg-stock-in-bg text-stock-in-ink',
  error: 'border-stock-out-ink/30 bg-stock-out-bg text-stock-out-ink',
  info: 'border-line bg-surface text-ink',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = (idRef.current += 1);
      const tone = input.tone ?? 'info';
      setToasts((prev) => [...prev, { id, title: input.title, description: input.description, tone }]);
      const duration = input.duration ?? 4500;
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-overlay)] flex flex-col items-center gap-2 p-4 sm:items-end">
            {toasts.map((t) => (
              <div
                key={t.id}
                role={t.tone === 'error' ? 'alert' : 'status'}
                className={cn(
                  'animate-panel-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-lift',
                  TONE_STYLES[t.tone],
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-xs opacity-80">{t.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="-mr-1 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
