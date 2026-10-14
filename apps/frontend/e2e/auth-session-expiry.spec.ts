import { expect, test, type Page } from '@playwright/test';

// Disposable PF-S08 harness only, run by scripts/pf_s08_session_expiry.py with
// a short Auth jwt_expiry so the access token genuinely expires mid-session.
const email = process.env.PF_S08_EXPIRY_EMAIL;
const password = process.env.PF_S08_EXPIRY_PASSWORD;
const apiUrl = process.env.PF_S08_API_URL;
const ttlSeconds = Number(process.env.PF_S08_JWT_EXPIRY_SECONDS);
const marker = 'PF-S08 Expiry marker';

const storedAccessToken = (page: Page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  return key ? (JSON.parse(localStorage.getItem(key) ?? '{}').access_token as string | undefined) : undefined;
});

const nextTransactionsFetch = (page: Page) => page.waitForResponse(response =>
  new URL(response.url()).pathname === '/api/transactions' && response.request().method() === 'GET');

test('expired access token is refreshed without losing the session', async ({ page, request }) => {
  test.skip(!email || !password || !apiUrl || !(ttlSeconds > 0),
    'Runs only from scripts/pf_s08_session_expiry.py against the disposable harness');
  test.setTimeout((ttlSeconds + 90) * 1000);

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/cashflow\/overview$/);
  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByText(marker)).toBeVisible();
  const firstToken = await storedAccessToken(page);
  expect(firstToken).toBeTruthy();

  await page.waitForTimeout((ttlSeconds + 5) * 1000);

  // The original access token is now genuinely expired at the API.
  const stale = await request.get(`${apiUrl}/api/transactions?page=1&pageSize=1`, {
    headers: { Authorization: `Bearer ${firstToken}` },
  });
  expect(stale.status()).toBe(401);

  // A fresh in-app fetch succeeds with a refreshed token, not cached data.
  await page.getByRole('link', { name: 'Overview' }).click();
  const fetched = nextTransactionsFetch(page);
  await page.getByRole('link', { name: 'Transactions' }).click();
  const response = await fetched;
  expect(response.status()).toBe(200);
  expect(response.request().headers()['authorization']).not.toBe(`Bearer ${firstToken}`);
  await expect(page.getByText(marker)).toBeVisible();
  await expect(page).toHaveURL(/\/cashflow\/transactions$/);
  expect(await storedAccessToken(page)).not.toBe(firstToken);

  // Reload restores the session through the rotated refresh token.
  const reloaded = nextTransactionsFetch(page);
  await page.reload();
  expect((await reloaded).status()).toBe(200);
  await expect(page.getByText(marker)).toBeVisible();
  await expect(page).toHaveURL(/\/cashflow\/transactions$/);
});
