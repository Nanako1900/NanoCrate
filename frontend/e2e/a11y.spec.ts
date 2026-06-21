import { expect, test } from '@playwright/test';

/**
 * Keyboard-trap behavior for the overlay surfaces (F12/F13) — verified in a real
 * browser since jsdom can't faithfully model Tab navigation + focus.
 */

test('cart drawer keeps Tab focus inside and closes on Escape (F12)', async ({ page }) => {
  await page.goto('/p/nano75');
  const trigger = page.getByRole('button', { name: 'Add to cart' });
  await trigger.click();

  const drawer = page.getByRole('dialog', { name: 'Shopping cart' });
  await expect(drawer).toBeVisible();
  // Wait for the open transition to settle: panel no longer inert and focus has
  // moved into the dialog (the drawer focuses its panel on open).
  await page.waitForFunction(() => {
    const d = document.querySelector('[role="dialog"]') as HTMLElement | null;
    return Boolean(d && !d.inert && d.contains(document.activeElement));
  });

  // Tabbing repeatedly must never let focus leave the dialog.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return Boolean(dialog && document.activeElement && dialog.contains(document.activeElement));
    });
    expect(inside, `focus left the drawer after ${i + 1} Tab(s)`).toBe(true);
  }

  // Shift+Tab from the start wraps backwards, still inside.
  await page.keyboard.press('Shift+Tab');
  expect(
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return Boolean(dialog && document.activeElement && dialog.contains(document.activeElement));
    }),
  ).toBe(true);

  // Escape closes the drawer (it goes inert, leaving the trap).
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const d = document.querySelector('[role="dialog"]') as HTMLElement | null;
    return !d || d.inert;
  });
});

test('account menu moves focus to its first item on open and traps Tab (F13)', async ({ page }) => {
  await page.goto('/');
  // Mock-mode instant sign-in via the header control.
  await page.getByRole('button', { name: 'Sign in' }).click();

  const trigger = page.locator('summary[aria-label="Account menu"]');
  await trigger.click();

  // First item (Orders) receives focus on open.
  await expect(page.getByRole('link', { name: 'Orders' })).toBeFocused();

  // Tab stays within the open menu (Orders ↔ Sign out).
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => document.activeElement?.textContent?.trim());
    expect(['Orders', 'Sign out']).toContain(name);
  }

  // Escape closes and returns focus to the trigger.
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
