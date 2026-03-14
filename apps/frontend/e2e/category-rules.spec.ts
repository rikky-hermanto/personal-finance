import { test, expect } from '@playwright/test';

const UNIQUE_KEYWORD = `e2e-test-${Date.now()}`;

test.describe('Category rules CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Categories/i }).click();
    await expect(page.getByText('Category Management')).toBeVisible();
  });

  test('shows the rules table', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Keyword' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Category' })).toBeVisible();
  });

  test('creates a new category rule and it appears in the list', async ({ page }) => {
    // Click "Add Rule"
    await page.getByRole('button', { name: /Add Rule/i }).click();

    // Fill keyword input (placeholder: "Enter keyword...")
    await page.getByPlaceholder('Enter keyword...').fill(UNIQUE_KEYWORD);

    // Select category from the dropdown (first select in the new row)
    const newRow = page.locator('tr.bg-gray-50');
    await newRow.locator('select').first().selectOption('Food & Dining');

    // Click the save icon button (green button in the new row)
    await newRow.locator('button.text-green-600').click();

    // The new keyword should appear in the table
    await expect(page.getByText(UNIQUE_KEYWORD)).toBeVisible({ timeout: 10000 });
  });

  test('deletes a category rule', async ({ page }) => {
    // Find the row with our test keyword created above
    const row = page.locator('tr', { hasText: UNIQUE_KEYWORD });
    if (await row.count() === 0) {
      test.skip();
      return;
    }

    // Click the red trash icon button in that row
    await row.locator('button.text-red-600').click();
    await expect(page.getByText(UNIQUE_KEYWORD)).not.toBeVisible({ timeout: 5000 });
  });
});
