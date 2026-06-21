import { expect, test, type Page } from '@playwright/test';

/**
 * Responsive (320–1440) for the *protected* + admin surfaces, plus the
 * storefront backlog (/checkout, /orders/:id). Mock auth is in-memory, so each
 * flow signs in once then resizes WITHOUT reloading (a reload would drop the
 * session). Asserts no horizontal page overflow at each breakpoint.
 */
const WIDTHS = [320, 768, 1024, 1440];

async function expectNoOverflowAcrossWidths(page: Page, context: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${context} @ ${width}px`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 900 }); // restore for further nav
}

test('admin pages: no overflow 320–1440', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin');
  await page.getByRole('button', { name: /sign in as admin/i }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expectNoOverflowAcrossWidths(page, 'admin/dashboard');

  for (const name of ['Products', 'Inventory', 'Orders', 'Settings'] as const) {
    await page.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
    await expectNoOverflowAcrossWidths(page, `admin/${name.toLowerCase()}`);
  }
});

test('storefront /checkout: no overflow 320–1440', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/p/nano75');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  const drawer = page.getByRole('dialog', { name: 'Shopping cart' });
  await drawer.getByRole('link', { name: 'Checkout' }).click();
  await page.locator('#main').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await expectNoOverflowAcrossWidths(page, 'checkout');
});

test('storefront /orders/:id: no overflow 320–1440', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/p/nano75');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByRole('dialog', { name: 'Shopping cart' }).getByRole('link', { name: 'Checkout' }).click();
  await page.locator('#main').getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /^Pay / }).click();
  await page.getByRole('link', { name: 'View order' }).click();
  await expect(page).toHaveURL(/\/orders\/o_/);
  await expectNoOverflowAcrossWidths(page, 'order-detail');
});
