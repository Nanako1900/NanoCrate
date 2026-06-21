import { expect, test, type Page } from '@playwright/test';

/** Admin console smoke: RBAC gate → admin sign-in → shell nav → ⌘K palette. */

async function signInAsAdmin(page: Page) {
  await page.goto('/admin');
  // RBAC gate for an anonymous visitor.
  await expect(page.getByRole('heading', { name: 'Sign in to the console' })).toBeVisible();
  await page.getByRole('button', { name: /sign in as admin/i }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
}

test('gates /admin, signs in as admin, and navigates the shell', async ({ page }) => {
  await signInAsAdmin(page);

  // Sidebar navigation (desktop rail).
  await page.getByRole('link', { name: 'Products' }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await expect(page.getByRole('heading', { name: 'Products', level: 1 })).toBeVisible();
});

test('⌘K command palette navigates', async ({ page }) => {
  await signInAsAdmin(page);

  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('combobox', { name: /search commands/i });
  await expect(input).toBeVisible();
  await input.fill('inventory');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/inventory$/);
});

