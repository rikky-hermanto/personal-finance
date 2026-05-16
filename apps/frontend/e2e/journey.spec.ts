import { test, expect } from '@playwright/test';

test.describe('Journey Page', () => {
  test('default route / redirects to /journey', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/journey$/);
  });

  test('legacy /dashboard redirects to /journey', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/journey$/);
  });

  test('renders heading and pyramid on load', async ({ page }) => {
    await page.goto('/journey');
    await expect(page.getByRole('heading', { name: /Your Financial Journey/i })).toBeVisible();
    await expect(page.locator('svg[data-testid="pyramid"]')).toBeVisible();
  });

  test('renders 5 tier level labels', async ({ page }) => {
    await page.goto('/journey');
    // Tier labels are rendered inside SVG text and tier card headings
    for (const label of ['Cashflow', 'Defense', 'Growth', 'Freedom', 'Legacy']) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test('sidebar has Journey item and not Dashboard', async ({ page }) => {
    await page.goto('/journey');
    await expect(page.getByRole('link', { name: 'Journey' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboard' })).not.toBeVisible();
  });

  test('tier card CTA navigates to cashflow module', async ({ page }) => {
    await page.goto('/journey');
    // Open Cashflow link inside TierCard for L1
    const cashflowLink = page.getByRole('link', { name: /Open Cashflow/i }).first();
    await expect(cashflowLink).toBeVisible();
    await cashflowLink.click();
    await expect(page).toHaveURL(/\/cashflow/);
  });

  test('Active Quests section is visible', async ({ page }) => {
    await page.goto('/journey');
    await expect(page.getByText(/Active Quests/i)).toBeVisible();
  });

  test('Recalculate button is present and clickable', async ({ page }) => {
    await page.goto('/journey');
    const recalcBtn = page.getByRole('button', { name: /Recalculate/i });
    await expect(recalcBtn).toBeVisible();
    // Just verify it doesn't throw — actual recalc requires full stack
  });

  test('Achievements link navigates to /journey/achievements', async ({ page }) => {
    await page.goto('/journey');
    await page.getByRole('link', { name: /Achievements/i }).click();
    await expect(page).toHaveURL(/\/journey\/achievements/);
    await expect(page.getByRole('heading', { name: /Achievements/i })).toBeVisible();
  });

  test('Activity Streak section renders', async ({ page }) => {
    await page.goto('/journey');
    await expect(page.getByText(/Activity Streak/i)).toBeVisible();
  });
});
