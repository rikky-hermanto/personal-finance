import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'transaction-template-sample.csv');

test.describe('Tiered Deduplication System', () => {
  test.beforeEach(async ({ page, request }) => {
    // Clean start for every test
    await request.delete('http://localhost:7208/api/transactions/reset');
    
    await page.goto('/');
    // Click the "New upload" button in the sidebar
    await page.getByRole('button', { name: /New upload/i }).click();
  });

  test('Tier 1: File Hashing — Rejecting identical file re-upload', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');

    // First upload
    await fileInput.setInputFiles(FIXTURE_PATH);
    await page.getByRole('button', { name: /Process/i }).click();

    // Wait for preview and submit
    await expect(page.getByRole('button', { name: /Submit Data/i })).toBeVisible({ timeout: 60000 });
    await page.getByRole('button', { name: /Submit Data/i }).click();

    // Success screen
    await expect(page.getByText(/Import complete/i)).toBeVisible();

    // Try to upload the EXACT same file again
    await page.getByRole('button', { name: /Import more files/i }).click();
    await fileInput.setInputFiles(FIXTURE_PATH);

    // Should show error immediately or after clicking process
    await page.getByRole('button', { name: /Process/i }).click();
    await expect(page.getByText(/This file has already been processed/i)).toBeVisible();
  });

  test('Tier 2 & 3: Database Deduplication — Rejecting identical transactions in new file', async ({ page, request }) => {
    const fileInput = page.locator('input[type="file"]');
    
    // 1. First upload
    await fileInput.setInputFiles(FIXTURE_PATH);
    await page.getByRole('button', { name: /Process/i }).click();
    await page.getByRole('button', { name: /Submit Data/i }).click();
    await expect(page.getByText(/Import complete/i)).toBeVisible();

    // 2. Prepare a modified file with same transactions but different hash
    const modifiedPath = path.join(__dirname, 'fixtures', 'transaction-template-sample-modified-v4.csv');
    const content = fs.readFileSync(FIXTURE_PATH, 'utf8');
    fs.writeFileSync(modifiedPath, content + '\n '); // Add newline and space

    // 3. Second upload (bypasses file hashing)
    await page.goto('/');
    await page.getByRole('button', { name: /New upload/i }).click();
    await page.locator('input[type="file"]').setInputFiles(modifiedPath);
    await page.getByRole('button', { name: /Process/i }).click();

    // 4. Verify deduplication (should show 0 transactions in preview)
    const submitBtn = page.getByRole('button', { name: /Submit Data/i });
    await expect(submitBtn).toContainText('(0 transactions)', { timeout: 15000 });
  });
});
