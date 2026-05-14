import { test, expect, request as playwrightRequest } from '@playwright/test';
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

// Cold-start regression: category_presets (Layer 2b) must categorize ≥50% of rows
// even when category_rules is empty (simulates a brand-new user).
// Requires: full stack running + category_presets migration applied.
test.describe('Cold-start categorization', () => {
  const API_URL = process.env.VITE_API_URL ?? 'http://localhost:7208';

  test('upload with empty rules shows ≥50% categorized rows via presets', async ({ page }) => {
    // Delete all user rules to simulate cold start
    const apiCtx = await playwrightRequest.newContext({ baseURL: API_URL });
    const deleteRes = await apiCtx.delete('/api/categoryrules/all');
    // Skip if endpoint not available or not authorized
    test.skip(
      !deleteRes.ok(),
      'DELETE /api/categoryrules/all failed — requires running API with seeded category_presets',
    );

    // Upload BCA fixture
    await page.goto('/cashflow/upload');
    await page.getByRole('button', { name: /Upload/i }).first().click();
    await expect(page.getByText('Upload Bank Statements')).toBeVisible();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(BCA_FIXTURE);
    await page.getByRole('button', { name: /Process Files/i }).click();
    await expect(page.getByRole('button', { name: /Submit Data/i })).toBeVisible({ timeout: 30_000 });

    // Count rows and untracked rows in the preview table
    const allRows = page.locator('[data-testid="preview-row"]');
    const rowCount = await allRows.count();

    if (rowCount === 0) {
      test.skip(true, 'No new transactions in preview — DB may already contain fixture data. Reset with: docker compose down -v');
    }

    const untrackedCount = await page.locator('text=Untracked Expense').count();
    const categorizedRatio = 1 - untrackedCount / rowCount;

    expect(
      categorizedRatio,
      `Only ${Math.round(categorizedRatio * 100)}% categorized — category_presets may not be seeded`,
    ).toBeGreaterThanOrEqual(0.5);

    await apiCtx.dispose();
  });
});
