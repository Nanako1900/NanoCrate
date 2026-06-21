// One-off visual check: screenshots catalog + product at key breakpoints.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '..', '.shots');
const BASE = process.env.SHOT_BASE ?? 'http://localhost:4173';
const widths = [320, 768, 1024, 1440];
const pages = [
  ['catalog', '/'],
  ['product', '/p/nano75'],
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [name, route] of pages) {
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    // Wait for real content (mock resolved) before shooting.
    await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible' });
    await page.waitForTimeout(350);
    const file = path.join(OUT, `${name}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    // Report horizontal overflow (any element wider than the viewport).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${name} @${width}  overflowX=${overflow}px  -> ${path.basename(file)}`);
    await ctx.close();
  }
}
await browser.close();
