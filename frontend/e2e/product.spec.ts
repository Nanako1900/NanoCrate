import { expect, test } from '@playwright/test';

test.describe('product detail', () => {
  test('loads detail and updates price when the variant changes', async ({ page }) => {
    await page.goto('/p/nano75');
    await expect(page.getByRole('heading', { level: 1, name: 'Nano75' })).toBeVisible();
    await expect(page.getByText('$129.00').first()).toBeVisible();

    // Selecting the brown variant ($134.00) updates the headline price.
    await page.getByText('75% / Brown tactile / Charcoal PBT').click();
    await expect(page.getByText('$134.00').first()).toBeVisible();
  });

  test('navigates from the catalog to a product', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Nano75' }).click();
    await expect(page).toHaveURL(/\/p\/nano75/);
    await expect(page.getByRole('heading', { level: 1, name: 'Nano75' })).toBeVisible();
  });
});
