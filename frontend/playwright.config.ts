import { defineConfig, devices } from '@playwright/test';

/**
 * E2E + visual-regression config. Tests run against the dev server in MOCK mode
 * (VITE_API_MODE=mock) so they are fully deterministic and need no backend.
 */
export default defineConfig({
  testDir: './e2e',
  // Visual-regression tests are tagged @visual and OS/renderer-specific; the
  // portable suite runs `pnpm test:e2e` (grep-invert @visual), baselines run via
  // `pnpm test:visual` (grep @visual).
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_API_MODE: 'mock',
    },
  },
});
