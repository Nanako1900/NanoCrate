import { expect, test } from '@playwright/test';

/**
 * Dark theme: manual toggle flips <html data-theme>, repaints the surface, and
 * persists across reloads (localStorage) — while the auth token never persists.
 */
test('toggles light/dark, repaints, and persists across reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');

  const paperBefore = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );

  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  const paperAfter = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(paperAfter).not.toBe(paperBefore); // surface actually repainted

  // Persisted preference survives a reload (no flash back to light).
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('nanocrate-theme'))).toBe('dark');
});

test('respects prefers-color-scheme: dark by default', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.removeItem('nanocrate-theme'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
