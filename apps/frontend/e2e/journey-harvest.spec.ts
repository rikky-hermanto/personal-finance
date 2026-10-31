import { expect, test, type Page } from '@playwright/test';

const email = process.env.PF_S08_TEST_EMAIL_A;
const password = process.env.PF_S08_TEST_PASSWORD_A;
test.skip(!email || !password, 'needs the PF-S08 disposable browser credentials');

const offers = [
  { code: 'l1.sort_the_pile', kind: 'discovery', title: 'Sort the mystery pile', why: 'Give your top five merchants a category.', progress: null, deeplink: '/settings/categories' },
];

const harvest = (result: 'green' | 'red', basis = 'Based on 4 of 5 accounts') => ({
  month: '2026-09',
  title: 'September harvested',
  basis,
  accountsCovered: 4,
  accountsTotal: 5,
  result,
  // 4 of 5 accounts, so the real server adds the qualifier
  resultLine: `${result === 'red' ? 'Spending ran above income' : 'Spending stayed under income'} in the accounts you uploaded`,
  closing: 'Harvested. Your garden grew.',
  gardenBefore: 5,
  gardenAfter: 7,
  items: [
    { code: 'l2.count_your_cushion', glyph: '🪴', title: 'Count your cushion', line: 'You are covered for 1.4 months.', count: 1, completionIds: [41], isBackfill: false },
    { code: 'stars.spend_lt_income', glyph: '⭐', title: '⭐⭐ Spending under 89% of income', line: null, count: 1, completionIds: [42], isBackfill: false },
  ],
});

const board = (h: unknown, rhythm = { current: 7, longest: 9 }) => ({
  catalogVersion: 1, workingLevel: 'L1', focus: null, offers, harvest: h, rhythm,
  levelGoal: null,
});

async function stub(page: Page, initial: unknown, rhythm?: { current: number; longest: number }) {
  let current = initial;
  const seenBodies: unknown[] = [];
  await page.route('**/api/journey/quests', (route) => route.fulfill({ json: board(current, rhythm) }));
  await page.route('**/api/journey/harvest/seen', async (route) => {
    seenBodies.push(route.request().postDataJSON());
    current = null; // what the server does once the reveal is marked seen
    await route.fulfill({ status: 204 });
  });
  return seenBodies;
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/journey$/);
}

test('plays exactly the two completions, marks them seen once, and never replays after a reload', async ({ page }) => {
  const seen = await stub(page, harvest('green'));
  await signIn(page);

  const panel = page.getByTestId('harvest-panel');
  await expect(panel).toContainText('September harvested');
  await expect(panel).toContainText('Based on 4 of 5 accounts');
  await expect(page.getByTestId('harvest-card')).toHaveCount(1);
  await expect(page.getByTestId('harvest-card')).toHaveCount(2, { timeout: 10_000 });
  await expect(panel.getByRole('button', { name: 'Done' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('harvest-card')).toHaveCount(2);

  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0]).toEqual({ ids: [41, 42], month: '2026-09' });

  await page.reload();
  await expect(page.getByRole('heading', { name: /Your Financial Journey/i })).toBeVisible();
  await expect(page.getByTestId('harvest-panel')).toHaveCount(0);
});

test('coming back to Journey inside the app does not replay a harvest that was already seen', async ({ page }) => {
  const seen = await stub(page, harvest('green'));
  await signIn(page);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect.poll(() => seen.length).toBe(1);

  // No page reload: the react-query cache survives this navigation.
  await page.getByRole('link', { name: /Achievements/ }).click();
  await expect(page).toHaveURL(/\/journey\/achievements$/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: /Your Financial Journey/i })).toBeVisible();

  await expect(page.getByTestId('harvest-panel')).toHaveCount(0);
  expect(seen.length).toBe(1);
});

test('Skip finishes at once and still marks everything seen', async ({ page }) => {
  const seen = await stub(page, harvest('green'));
  await signIn(page);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByTestId('harvest-card')).toHaveCount(2);
  await expect.poll(() => seen.length).toBe(1);
});

test('does not block the page while it plays', async ({ page }) => {
  await stub(page, harvest('green'));
  await signIn(page);
  await expect(page.getByTestId('harvest-panel')).toBeVisible();
  await page.getByRole('link', { name: /Achievements/ }).click();
  await expect(page).toHaveURL(/\/journey\/achievements$/);
});

test('a hidden tab neither advances the reveal nor marks it seen', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __hidden: boolean }).__hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => (window as unknown as { __hidden: boolean }).__hidden });
  });
  const seen = await stub(page, harvest('green'));
  await signIn(page);
  await expect(page.getByTestId('harvest-card')).toHaveCount(1);

  // Longer than one card's dwell time: nothing may move while hidden, and Skip must not mark it seen early.
  await page.waitForTimeout(4_000);
  await expect(page.getByTestId('harvest-card')).toHaveCount(1);
  expect(seen.length).toBe(0);

  await page.evaluate(() => {
    (window as unknown as { __hidden: boolean }).__hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('harvest-card')).toHaveCount(2, { timeout: 10_000 });
  await expect.poll(() => seen.length).toBe(1);
});

test('reduced motion shows all cards at once as static cards', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seen = await stub(page, harvest('green'));
  await signIn(page);
  await expect(page.getByTestId('harvest-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);
  await expect(page.getByTestId('garden-count')).toHaveText('7');
  await expect.poll(() => seen.length).toBe(1);
});

test('a red month keeps the neutral copy, no shame wording and no red styling', async ({ page }) => {
  await stub(page, harvest('red'));
  await signIn(page);
  const panel = page.getByTestId('harvest-panel');
  await expect(panel).toContainText('Harvested. Your garden grew.');
  await expect(panel).toContainText('Spending ran above income');
  const text = (await panel.innerText()).toLowerCase();
  expect(text).not.toMatch(/\b(fail\w*|bad|worse|worst|wast\w*|shame\w*|guilt\w*|lazy|behind|late|lost|miss\w*|broke\w*|streak\w*|mistake\w*)\b/);
  await expect(panel.locator('[class*="red-"], [class*="destructive"], [class*="expense"]')).toHaveCount(0);
});

test('a restarted rhythm shows only the new count', async ({ page }) => {
  await stub(page, null, { current: 2, longest: 7 });
  await signIn(page);
  const line = page.getByTestId('rhythm-line');
  await expect(line).toHaveText('Monthly rhythm · 2 months · longest 7 months');
  await expect(line).not.toHaveText(/lost|broke|streak|miss/i);
});
