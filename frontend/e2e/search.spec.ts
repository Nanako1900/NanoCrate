import { expect, test } from '@playwright/test';

/** Semantic search (P4): header Enter → /search, relevance-ranked results,
 *  no-results suggestions, and example-driven discovery. */

test('header search runs a semantic search and ranks results', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Search keyboards');
  await input.fill('quiet office full-size hot-swappable');
  await input.press('Enter');

  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.getByRole('heading', { name: /describe what/i })).toBeVisible();
  // At least one ranked result links to a product.
  await expect(page.locator('ol li a[href^="/p/"]').first()).toBeVisible();
  await expect(page.getByText(/matches for/i)).toBeVisible();
});

test('no matches shows the empty state with suggestions', async ({ page }) => {
  await page.goto('/search?q=zzzqqqx');
  await expect(page.getByRole('heading', { name: /nothing matched/i })).toBeVisible();
  // Picking a suggestion runs a real search.
  await page.getByRole('button', { name: 'wireless 65% aluminum' }).click();
  await expect(page).toHaveURL(/q=wireless/);
  await expect(page.locator('ol li a[href^="/p/"]').first()).toBeVisible();
});

test('empty /search offers example queries', async ({ page }) => {
  await page.goto('/search');
  await expect(page.getByText('Try one of these')).toBeVisible();
  await page.getByRole('button', { name: 'linear red switches for gaming' }).click();
  await expect(page).toHaveURL(/q=linear/);
});
