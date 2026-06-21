import { expect, test, type Page } from '@playwright/test';

/**
 * Guards the 320–1440 responsive contract: no horizontal overflow on the core
 * public surfaces at the four breakpoints the design targets.
 */
const WIDTHS = [320, 768, 1024, 1440];

const PAGES: ReadonlyArray<{ path: string; ready: (page: Page) => Promise<unknown> }> = [
  { path: '/', ready: (page) => page.getByRole('link', { name: /nano75/i }).first().waitFor() },
  { path: '/p/nano75', ready: (page) => page.getByRole('button', { name: 'Add to cart' }).waitFor() },
  { path: '/cart', ready: (page) => page.getByRole('heading', { name: /cart/i }).first().waitFor() },
  { path: '/search?q=wireless%2065%25', ready: (page) => page.locator('ol li a[href^="/p/"]').first().waitFor() },
];

for (const width of WIDTHS) {
  for (const { path, ready } of PAGES) {
    test(`no horizontal overflow at ${width}px — ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await ready(page);

      // documentElement must not scroll horizontally (allow 1px sub-pixel slack).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${path} @ ${width}px`).toBeLessThanOrEqual(1);
    });
  }
}
