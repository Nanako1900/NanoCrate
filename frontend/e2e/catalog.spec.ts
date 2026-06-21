import { expect, test } from '@playwright/test';

test.describe('catalog', () => {
  test('landing renders the hero and product grid (mock data)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Product cards resolve once the MSW worker answers — deterministic wait.
    await expect(page.getByRole('link', { name: 'Nano75' })).toBeVisible();
  });

  test('filtering by category updates the URL and the results', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Switches/ }).click();
    await expect(page).toHaveURL(/type=switches/);
    await expect(page.getByRole('link', { name: /Linear Red Switches/ })).toBeVisible();
    // A keyboard-only product should no longer be present.
    await expect(page.getByRole('link', { name: 'Nano75' })).toHaveCount(0);
  });
});
