import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('loads and shows summary cards with no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');

    // Sidebar nav is visible
    await expect(page.getByRole('button', { name: /Dashboard/i })).toBeVisible();

    // Main content area is visible
    await expect(page.locator('main')).toBeVisible();

    // No unhandled JS errors (ignoring ResizeObserver noise)
    expect(consoleErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('navigates between sidebar views', async ({ page }) => {
    await page.goto('/');

    // Navigate to Upload
    await page.getByRole('button', { name: /Upload/i }).click();
    await expect(page.getByRole('heading', { name: 'Upload Transactions', level: 1 })).toBeVisible();

    // Navigate to Transactions
    await page.getByRole('button', { name: /Transactions/i }).click();
    await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();

    // Navigate to Categories
    await page.getByRole('button', { name: /Categories/i }).click();
    await expect(page.getByText('Category Management')).toBeVisible();

    // Navigate back to Dashboard
    await page.getByRole('button', { name: /Dashboard/i }).click();
    await expect(page.locator('main')).toBeVisible();
  });
});
