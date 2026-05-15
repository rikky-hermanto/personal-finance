import { test, expect } from '@playwright/test';

test('assets flow: add institution → account → valuation → verify headline', async ({ page }) => {
  await page.goto('/assets/overview');

  // Headline shows — even if Rp 0
  await expect(page.getByTestId('net-worth-headline')).toBeVisible();

  // Navigate to accounts tab
  await page.click('a[href="/assets/accounts"]');

  // Add institution
  await page.click('button:has-text("Add Institution")');
  await page.fill('[name="name"]', 'BCA Test');
  await page.selectOption('[name="type"]', 'bank');
  await page.click('button:has-text("Save")');
  await expect(page.getByText('BCA Test')).toBeVisible();

  // Add account
  await page.click('button:has-text("Add Account")');
  await page.fill('[name="name"]', 'BCA Tabungan');
  await page.selectOption('[name="accountType"]', 'savings');
  await page.click('button:has-text("Save")');

  // Add valuation
  await page.click('button:has-text("Add Valuation")');
  await page.fill('[name="valueNative"]', '50000000');
  await page.click('button:has-text("Save")');

  // Overview should update
  await page.click('a[href="/assets/overview"]');
  await expect(page.getByTestId('net-worth-headline')).toContainText('50');
});
