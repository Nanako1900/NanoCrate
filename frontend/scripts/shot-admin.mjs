import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '..', '.shots');
const BASE = process.env.SHOT_BASE ?? 'http://localhost:4173';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function shot(name, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 980 } });
  if (theme === 'dark') {
    await ctx.addInitScript(() => localStorage.setItem('nanocrate-theme', 'dark'));
  }
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  // Pass the admin RBAC gate (mock instant sign-in), then land on the dashboard.
  const signIn = page.getByRole('button', { name: /Sign in as admin/i });
  if (await signIn.count()) {
    await signIn.click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, name) });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${name}  overflowX=${ov}px`);
  await ctx.close();
}

await shot('admin-reskin-light.png', 'light');
await shot('admin-reskin-dark.png', 'dark');
await browser.close();
