import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 smoke: full mock-first purchase flow (add → cart → checkout →
 * mock payment → result → order) plus the out_of_stock and payment_failed
 * error paths. Deterministic waits, no backend.
 */

async function addNano75AndReachCheckout(page: Page) {
  await page.goto('/p/nano75');
  await page.getByRole('button', { name: 'Add to cart' }).click();

  const drawer = page.getByRole('dialog', { name: 'Shopping cart' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('NANO75-RED-PBTW')).toBeVisible();
  await drawer.getByRole('link', { name: 'Checkout' }).click();

  // Protected route → mock sign-in gate (scoped to main, not the header control).
  await page.locator('#main').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
}

test('add to cart → checkout (mock) → paid → order detail', async ({ page }) => {
  await addNano75AndReachCheckout(page);

  await page.getByRole('button', { name: /^Pay / }).click();

  // Result page polls order status; success is confirmed (not assumed from redirect).
  await expect(page.getByRole('heading', { name: 'Payment confirmed' })).toBeVisible();

  await page.getByRole('link', { name: 'View order' }).click();
  await expect(page).toHaveURL(/\/orders\/o_/);
  await expect(page.getByText('Paid', { exact: true })).toBeVisible();
});

test('out_of_stock shows a clear error at checkout', async ({ page }) => {
  await addNano75AndReachCheckout(page);

  await page.getByLabel('Mock control · simulate result').selectOption('out_of_stock');
  await page.getByRole('button', { name: /^Pay / }).click();

  await expect(page.getByRole('alert')).toContainText(/no longer available/i);
});

test('payment failure shows the failed result with retry', async ({ page }) => {
  await addNano75AndReachCheckout(page);

  await page.getByLabel('Mock control · simulate result').selectOption('failed');
  await page.getByRole('button', { name: /^Pay / }).click();

  await expect(page.getByRole('heading', { name: /go through/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
});
