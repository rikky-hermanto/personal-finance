import { test, expect } from '@playwright/test';

test('assets flow: add first account with balance → verify headline', async ({ page }) => {
  await page.goto('/assets/overview');

  // Headline shows — even if Rp 0
  await expect(page.getByTestId('net-worth-headline')).toBeVisible();

  // Navigate to accounts tab
  await page.click('a[href="/assets/accounts"]');

  // Add the first account through the first-run flow, with today's balance
  await page.getByRole('radio', { name: /Bank/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Name').fill('BCA Test');
  await page.getByLabel('Balance today').fill('50000000');
  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByRole('button', { name: /BCA Test/ })).toBeVisible();

  // Overview should update
  await page.click('a[href="/assets/overview"]');
  await expect(page.getByTestId('net-worth-headline')).toContainText('50');
});
