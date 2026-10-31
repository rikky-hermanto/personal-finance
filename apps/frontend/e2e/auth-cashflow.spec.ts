import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const credentials = [
  { email: process.env.PF_S08_TEST_EMAIL_A, password: process.env.PF_S08_TEST_PASSWORD_A },
  { email: process.env.PF_S08_TEST_EMAIL_B, password: process.env.PF_S08_TEST_PASSWORD_B },
  { email: process.env.PF_S08_TEST_EMAIL_EMPTY, password: process.env.PF_S08_TEST_PASSWORD_EMPTY },
];

async function signIn(page: Page, index: number) {
  const user = credentials[index];
  if (!user.email || !user.password) throw new Error('PF-S08 disposable browser credentials missing');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/journey$/);
  await page.getByRole('button', { name: 'Cashflow' }).click();
  await expect(page).toHaveURL(/\/cashflow\/overview$/);
  await page.getByRole('tab', { name: 'Transactions' }).click();
  await expect(page).toHaveURL(/\/cashflow\/transactions$/);
}

test('login, refresh, logout, account switch, and late-response isolation', async ({ page, request }) => {
  const markerA = 'PF-S08 Browser A';
  const markerB = 'PF-S08 Browser B';
  await page.goto('/cashflow/transactions');
  await expect(page).toHaveURL(/\/login$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByLabel('Email').fill('invalid@example.invalid');
  await page.getByLabel('Password').fill('x');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Sign in failed.');
  await signIn(page, 0);
  await expect(page.getByText(markerA).first()).toBeVisible();
  await expect(page.getByText(markerB)).toHaveCount(0);
  const wasDark = await page.locator('html').evaluate(element => element.classList.contains('dark'));
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark')))
    .toBe(!wasDark);
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('tab', { name: 'Transactions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.reload();
  await expect(page.getByText(markerA).first()).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 1);
  await expect(page.getByText(markerB).first()).toBeVisible();
  await expect(page.getByText(markerA)).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 0);
  await expect(page.getByText(markerA).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(page).toHaveURL(/\/cashflow\/overview$/);

  let releaseOldResponse: (() => void) | undefined;
  let markHeld: (() => void) | undefined;
  const held = new Promise<void>(resolve => { markHeld = resolve; });
  let holdOnce = true;
  await page.route('**/api/transactions*', async route => {
    if (holdOnce) {
      holdOnce = false;
      markHeld?.();
      await new Promise<void>(resolve => { releaseOldResponse = resolve; });
    }
    await route.continue().catch(() => {});
  });
  await page.getByRole('tab', { name: 'Transactions' }).click();
  await held;
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 1);
  await expect(page.getByText(markerB).first()).toBeVisible();
  releaseOldResponse?.();
  await expect(page.getByText(markerA)).toHaveCount(0);

  const apiUrl = process.env.PF_S08_API_URL;
  const tokenA = process.env.PF_S08_TEST_TOKEN_A;
  if (!apiUrl || !tokenA) throw new Error('PF-S08 disposable API credentials missing');
  const insertAsA = async (description: string) => {
    const response = await request.post(`${apiUrl}/api/transactions/submit`, {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: { requestId: randomUUID(), transactions: [{
        date: new Date().toISOString(), description, remarks: '', flow: 'CR',
        type: 'Income', category: 'Test', accountId: null, accountName: '',
        amountIdr: 1, currency: 'IDR',
      }] },
    });
    expect(response.ok()).toBeTruthy();
  };
  await page.waitForTimeout(2_000);
  await insertAsA('PF-S08 Realtime A only');
  await page.waitForTimeout(2_000);
  await expect(page.getByText('PF-S08 Realtime A only')).toHaveCount(0);
  await expect(page.getByText('Transaksi baru', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 0);
  await page.waitForTimeout(2_000);
  await insertAsA('PF-S08 Realtime A visible');
  await expect(page.getByText('Transaksi baru', { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 2);
  // The old Settings route now lands on the single Accounts page, which starts with the first-run flow.
  await page.goto('/settings/banks');
  await expect(page).toHaveURL(/\/assets\/accounts$/);
  await expect(page.getByRole('heading', { name: 'Where does your money live?' })).toBeVisible();
  await page.getByRole('radio', { name: /Bank/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Name').fill('PF-S08 New Bank');
  await page.getByLabel('Balance today').fill('1500000');
  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByRole('button', { name: /PF-S08 New Bank/ })).toBeVisible();

  // A second account at the same bank reuses it instead of creating another.
  await page.getByRole('button', { name: 'Add account' }).click();
  const addDialog = page.getByRole('dialog', { name: 'Add account' });
  await addDialog.getByRole('radio', { name: /Bank/ }).click();
  await addDialog.getByRole('button', { name: 'Continue' }).click();
  await addDialog.getByLabel('Name').fill('PF-S08 New Bank');
  await expect(addDialog.getByText('Adds an account to your existing PF-S08 New Bank.')).toBeVisible();
  await addDialog.getByLabel('Balance today').fill('0');
  await addDialog.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByText('PF-S08 New Bank Savings')).toBeVisible();
});
