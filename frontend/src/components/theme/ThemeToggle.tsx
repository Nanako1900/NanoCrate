import { useTheme } from './ThemeContext';
import { cn } from '@/lib/cn';

const baseBtn =
  'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-soft ' +
  'transition-[transform,background-color,border-color,color] duration-150 ease-out ' +
  'hover:border-line-strong hover:text-ink active:translate-y-px';

interface ThemeToggleProps {
  className?: string;
  /** Localized labels for the theme you'd switch *to* (storefront defaults to
   *  English; the zh-CN admin passes Chinese). */
  labels?: { light: string; dark: string };
}

/** Single-tap light/dark switch. Persists an explicit preference; the icon
 *  shows the theme you'd switch *to*, which is the affordance users expect. */
export function ThemeToggle({ className, labels }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = (labels ?? { light: 'Switch to light theme', dark: 'Switch to dark theme' })[next];

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(baseBtn, className)}
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? (
        // Sun — currently dark, tap for light.
        <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
        </svg>
      ) : (
        // Moon — currently light, tap for dark.
        <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  );
}
