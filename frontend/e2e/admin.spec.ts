import { expect, test, type Page } from '@playwright/test';

/** Admin console smoke (zh-CN, indigo): RBAC gate → admin sign-in → shell nav → ⌘K. */

async function signInAsAdmin(page: Page) {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '登录管理后台' })).toBeVisible();
  await page.getByRole('button', { name: /以管理员登录/ }).click();
  await expect(page.getByRole('heading', { name: '仪表盘', level: 1 })).toBeVisible();
}

test('gates /admin, signs in as admin, and navigates the shell', async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByRole('link', { name: '商品' }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await expect(page.getByRole('heading', { name: '商品', level: 1 })).toBeVisible();
});

test('⌘K command palette navigates', async ({ page }) => {
  await signInAsAdmin(page);
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('combobox', { name: /搜索命令/ });
  await expect(input).toBeVisible();
  await input.fill('inventory'); // matches the /admin/inventory path hint
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/inventory$/);
});

test('dashboard surfaces KPIs including the stock-conflict metric', async ({ page }) => {
  await signInAsAdmin(page);
  await expect(page.getByText('库存冲突')).toBeVisible();
  await expect(page.getByText(/营收/)).toBeVisible();
  await expect(page.getByRole('img', { name: /每日订单/ })).toBeVisible();
});

test('★ create a product via the dynamic attribute form (with validation)', async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByRole('link', { name: '商品' }).click();
  await page.getByRole('link', { name: /新建商品/ }).click();

  await page.getByLabel('名称').fill('Nano E2E');
  await page.getByLabel('类型').selectOption('keyboard');

  // Submitting without the required schema fields surfaces an inline error.
  await page.getByRole('button', { name: '创建商品' }).click();
  await expect(page.getByText(/布局.*为必填/)).toBeVisible();

  // Fill the required (schema-driven) fields, then create.
  await page.getByLabel('布局').selectOption('75%');
  await page.getByLabel('定位结构').selectOption('gasket');
  await page.getByLabel('连接').selectOption('wired');
  await page.getByRole('button', { name: '创建商品' }).click();

  await expect(page.getByRole('heading', { name: '编辑商品' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /规格与 SKU/ })).toBeVisible();
});

test('inventory restock writes to the stock ledger', async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByRole('link', { name: '库存' }).click();
  await expect(page.getByRole('heading', { name: '库存', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: '补货' }).first().click();
  const dialog = page.getByRole('dialog', { name: '补货' });
  await dialog.getByLabel('补货数量').fill('25');
  await dialog.getByRole('button', { name: '确认补货' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已补货' })).toBeVisible();

  await page.getByRole('button', { name: '台账' }).first().click();
  const ledger = page.getByRole('dialog', { name: '库存台账' });
  await expect(ledger.getByText('补货').first()).toBeVisible();
});

test('orders list opens an order with a status timeline', async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByRole('link', { name: '订单' }).click();
  await page.getByRole('cell', { name: /o_0\d/ }).first().click();
  await expect(page.getByRole('heading', { name: '状态时间线' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /快照/ })).toBeVisible();
});

test('order rows are keyboard-activatable (a11y)', async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByRole('link', { name: '订单' }).click();
  await expect(page.getByRole('heading', { name: '订单', level: 1 })).toBeVisible();
  const row = page.getByRole('row', { name: /打开订单 o_0\d/ }).first();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/orders\/o_/);
});
