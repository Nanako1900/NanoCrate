import { expect, test, type Page } from '@playwright/test';

/**
 * Visual-regression baselines for key screens (storefront + admin) in BOTH
 * themes (design-brief §13.5). Baselines are generated with --update-snapshots;
 * data is deterministic (MSW) and animations are disabled for stable diffs.
 * These are environment-specific references — regenerate if the toolchain/OS
 * rendering changes.
 */
test.use({ viewport: { width: 1280, height: 800 } });

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

const SNAP = { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.02 } as const;

for (const theme of ['light', 'dark'] as const) {
  test(`storefront home — ${theme} @visual`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('nanocrate-theme', t), theme);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /nano75/i }).first()).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`home-${theme}.png`, SNAP);
  });

  test(`storefront product — ${theme} @visual`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('nanocrate-theme', t), theme);
    await page.goto('/p/nano75');
    await expect(page.getByRole('button', { name: 'Add to cart' })).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`product-${theme}.png`, SNAP);
  });
}

test('storefront semantic search @visual', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nanocrate-theme', 'light'));
  await page.goto('/search?q=quiet office full-size hot-swappable');
  await expect(page.locator('ol li a[href^="/p/"]').first()).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('search-light.png', SNAP);
});

test('admin console — both themes @visual', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: /以管理员登录/ }).click();
  await expect(page.getByRole('heading', { name: '仪表盘', level: 1 })).toBeVisible();
  await expect(page.getByText('库存冲突')).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('admin-dashboard-light.png', SNAP);

  // Toggle to dark client-side (keeps the admin session), then re-shoot.
  await page.getByRole('button', { name: '切换到深色主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await settle(page);
  await expect(page).toHaveScreenshot('admin-dashboard-dark.png', SNAP);

  // Products table in dark.
  await page.getByRole('link', { name: '商品' }).click();
  await expect(page.getByRole('heading', { name: '商品', level: 1 })).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('admin-products-dark.png', SNAP);
});
