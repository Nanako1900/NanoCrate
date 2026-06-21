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

test('dashboard surfaces KPIs including the stock-conflict metric', async ({ page }) => {
  await signInAsAdmin(page);
  await expect(page.getByText('Stock conflicts')).toBeVisible();
  await expect(page.getByText('Revenue (paid)')).toBeVisible();
  await expect(page.getByRole('img', { name: /orders per day/i })).toBeVisible();
});

test('★ create a product via the dynamic attribute form (with validation)', async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByRole('link', { name: 'Products' }).click();
  await page.getByRole('link', { name: /new product/i }).click();

  await page.getByLabel('Name').fill('Nano E2E');
  await page.getByLabel(/^Type/).selectOption('keyboard');

  // Submitting without the required schema fields surfaces an inline error.
  await page.getByRole('button', { name: 'Create product' }).click();
  await expect(page.getByText('Layout is required.')).toBeVisible();

  // Fill the required (schema-driven) fields, then create.
  await page.getByLabel(/^Layout/).selectOption('75%');
  await page.getByLabel(/^Mount/).selectOption('gasket');
  await page.getByLabel(/^Connection/).selectOption('wired');
  await page.getByRole('button', { name: 'Create product' }).click();

  // Lands on the editor with the variant section ready.
  await expect(page.getByRole('heading', { name: 'Edit product' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Variants & SKUs/ })).toBeVisible();
});

test('inventory restock writes to the stock ledger', async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(page.getByRole('heading', { name: 'Inventory', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Restock' }).first().click();
  const dialog = page.getByRole('dialog', { name: /restock variant/i });
  await dialog.getByLabel('Quantity to add').fill('25');
  await dialog.getByRole('button', { name: 'Add stock' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Stock added' })).toBeVisible();

  // The ledger now shows a restock movement.
  await page.getByRole('button', { name: 'Ledger' }).first().click();
  const ledger = page.getByRole('dialog', { name: /stock ledger/i });
  await expect(ledger.getByText('restock').first()).toBeVisible();
});

test('orders list opens an order with a status timeline', async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByRole('link', { name: 'Orders' }).click();
  await page.getByRole('cell', { name: /o_0\d/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Items/ })).toBeVisible();
});

test('order rows are keyboard-activatable (a11y)', async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByRole('link', { name: 'Orders' }).click();
  await expect(page.getByRole('heading', { name: 'Orders', level: 1 })).toBeVisible();
  // Focus the first clickable row by its accessible name and activate with Enter.
  const row = page.getByRole('row', { name: /Open order o_0\d/ }).first();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/orders\/o_/);
});

