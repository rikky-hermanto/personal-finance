import { test, expect } from '@playwright/test';

const UNIQUE_KEYWORD = `e2e-test-${Date.now()}`;

test.describe('Category rules CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/categories');
    await expect(page.getByText('Category Rules')).toBeVisible();
  });

  test('shows the rules table', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Keyword' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Category' })).toBeVisible();
  });

  test('creates a new category rule and it appears in the list', async ({ page }) => {
    await page.getByRole('button', { name: /Add Rule/i }).click();

    await page.getByPlaceholder('KEYWORD').fill(UNIQUE_KEYWORD);

    const newRow = page.locator('tr.bg-muted');
    // Select category (second select: type is first, category is second)
    await newRow.locator('select').nth(1).selectOption('Food & Dining');

    // Save button uses text-success class
    await newRow.locator('button.text-success').click();

    await expect(page.getByText(UNIQUE_KEYWORD)).toBeVisible({ timeout: 10000 });
  });

  test('deletes a category rule', async ({ page }) => {
    const row = page.locator('tr', { hasText: UNIQUE_KEYWORD });
    if (await row.count() === 0) {
      test.skip();
      return;
    }

    // Delete button is the second icon button in the actions cell
    await row.locator('button').nth(1).click();
    await expect(page.getByText(UNIQUE_KEYWORD)).not.toBeVisible({ timeout: 5000 });
  });
});
