/**
 * Theme model. `preference` is what the user chose and what we persist;
 * `resolved` is the concrete light/dark applied to <html data-theme>. Only the
 * UI *preference* is stored (localStorage) — the auth token never is (it stays
 * in memory, see services/auth-token). The same resolution runs in an inline
 * pre-paint script in index.html to avoid a flash of the wrong theme.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'nanocrate-theme';

/** Surface colors (paper) fed to the <meta name="theme-color"> per theme. */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#f3efe7',
  dark: '#262320',
};

export function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function readStoredPreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export function resolvePreference(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref;
}

/** Apply the resolved theme to the document (data-theme + color-scheme meta). */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[resolved]);
  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute('content', resolved);
}
