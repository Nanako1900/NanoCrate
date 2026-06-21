import { expect, test, type Page } from '@playwright/test';

/**
 * Both themes must meet WCAG AA. This reads the *computed* token colors from a
 * probe element (browser resolves oklch → rgb) and checks contrast ratios for
 * the text/background pairs that actually ship, in light and dark.
 */

// foreground token, background token, min ratio (4.5 = AA normal text).
const PAIRS: ReadonlyArray<[string, string, number]> = [
  ['--ink', '--paper', 4.5],
  ['--ink', '--surface', 4.5],
  ['--ink-soft', '--paper', 4.5],
  ['--ink-soft', '--surface', 4.5],
  ['--ink-faint', '--surface', 4.5], // tightest: small mono labels
  ['--ink-faint', '--paper', 4.5],
  ['--ink-invert', '--surface-invert', 4.5],
  ['--accent-ink', '--accent', 4.5], // primary button label
  ['--interactive', '--paper', 4.5], // links
  ['--stock-in-ink', '--stock-in-bg', 4.5],
  ['--stock-low-ink', '--stock-low-bg', 4.5],
  ['--stock-out-ink', '--stock-out-bg', 4.5],
];

async function ratios(page: Page): Promise<Record<string, number>> {
  return page.evaluate((pairs) => {
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const ctx = document.createElement('canvas').getContext('2d')!;
    const toRgb = (token: string): [number, number, number] => {
      // Resolve the token, then rasterize through canvas so any color space
      // (oklch/oklab) is normalized to sRGB bytes regardless of serialization.
      probe.style.color = `var(${token})`;
      ctx.fillStyle = getComputedStyle(probe).color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    };
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = ([r, g, b]: [number, number, number]) =>
      0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const out: Record<string, number> = {};
    for (const [fg, bg] of pairs) {
      const l1 = lum(toRgb(fg));
      const l2 = lum(toRgb(bg));
      out[`${fg} on ${bg}`] = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    probe.remove();
    return out;
  }, PAIRS as unknown as string[][]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} theme meets AA for shipped text pairs`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);

    const result = await ratios(page);
    for (const [fg, bg, min] of PAIRS) {
      const got = result[`${fg} on ${bg}`];
      expect(got, `${fg} on ${bg} (${theme})`).toBeGreaterThanOrEqual(min);
    }
  });
}
