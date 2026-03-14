import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

// Serial mode: preview before submit, so state is deterministic within a run.
test.describe.configure({ mode: 'serial' });

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BCA_FIXTURE = path.join(__dirname, 'fixtures', 'bca-sample.csv');

test.describe('Upload flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Upload/i }).click();
    await expect(page.getByText('Upload Bank Statements')).toBeVisible();
  });

  test('upload preview — file is parsed and preview screen appears', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(BCA_FIXTURE);

    await expect(page.getByText('bca-sample.csv')).toBeVisible();
    await page.getByRole('button', { name: /Process Files/i }).click();

    // Submit button always renders after a successful API parse, even with 0 new transactions
    // (the duplicate-filter in upload-preview may return 0 if DB already has these rows).
    await expect(page.getByRole('button', { name: /Submit Data/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Preview Parsed Data' })).toBeVisible();
  });

  test('submit flow — submit button leads to success screen', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(BCA_FIXTURE);

    await page.getByRole('button', { name: /Process Files/i }).click();

    const submitBtn = page.getByRole('button', { name: /Submit Data/i });
    await expect(submitBtn).toBeVisible({ timeout: 30_000 });

    // Skip if DB already has these transactions (requires `docker compose down -v` to reset)
    const btnText = await submitBtn.textContent();
    test.skip(
      btnText?.includes('(0 transactions)') ?? false,
      'All fixture transactions already exist in DB — reset with: docker compose down -v && docker compose up -d',
    );

    await submitBtn.click();
    await expect(page.getByText('Data Imported Successfully!')).toBeVisible();
  });
});
