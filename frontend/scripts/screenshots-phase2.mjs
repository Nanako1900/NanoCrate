// Visual check for Phase 2 surfaces at key breakpoints. Uses SPA navigation
// (link clicks) after the first load so the in-memory mock cart/auth persist.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '..', '.shots');
const BASE = process.env.SHOT_BASE ?? 'http://localhost:4173';
const widths = [320, 768, 1024, 1440];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function shot(page, name, width) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log(`${name} @${width}  overflowX=${overflow}px`);
}

for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/p/nano75`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Add to cart' }).click();
  const drawer = page.getByRole('dialog', { name: 'Shopping cart' });
  await drawer.getByText('NANO75-RED-PBTW').waitFor();
  await shot(page, 'cart-drawer', width);

  await drawer.getByRole('link', { name: 'View cart' }).click();
  await page.getByRole('heading', { name: 'Cart', exact: true }).waitFor();
  await shot(page, 'cart-page', width);

  await page.locator('#main').getByRole('link', { name: 'Checkout' }).click();
  await page.locator('#main').getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Checkout' }).waitFor();
  await shot(page, 'checkout', width);

  await page.getByRole('button', { name: /^Pay / }).click();
  await page.getByRole('heading', { name: 'Payment confirmed' }).waitFor();
  await shot(page, 'result', width);

  await page.getByRole('link', { name: 'View order' }).click();
  await page.getByText('Paid', { exact: true }).waitFor();
  await shot(page, 'order-detail', width);

  await page.locator('#main').getByRole('link', { name: 'Orders' }).click();
  await page.getByRole('heading', { name: 'Orders', exact: true }).waitFor();
  await shot(page, 'orders', width);

  await ctx.close();
}

await browser.close();
