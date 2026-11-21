import { expect, test, type Page } from '@playwright/test';

// PF-154 Big Purchases, end to end against the running stack. Synthetic goal only (compliance change 6).
// Needs a disposable user with no open goals and no savings valuation; the spec deletes its own goal at the end.
const email = process.env.PF_S08_TEST_EMAIL_EMPTY;
const password = process.env.PF_S08_TEST_PASSWORD_EMPTY;
test.skip(!email || !password, 'needs the PF-S08 disposable empty-user browser credentials');
test.describe.configure({ mode: 'serial' });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The target month 24 months out, as the month input value and as the "Mon YYYY" the copy shows. */
function targetMonth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 24, 1);
  return { input: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/journey$/);
}

test('plans, funds, guards, achieves and deletes a synthetic big purchase', async ({ page }) => {
  const month = targetMonth();
  // 200.000.000 over 24 whole months, rounded up (formulas.md §9). On the 31st of a month the target
  // day is earlier than today and months left is 23, so this expectation assumes a day ≤ 28.
  const monthly = `Rp 8.333.334 a month until ${month.label}`;

  await signIn(page);
  await page.getByRole('button', { name: 'Big Purchases', exact: true }).click();
  await expect(page).toHaveURL(/\/big-purchases\/plans$/);

  // Empty state: guidance, not data.
  await expect(page.getByText('How Big Purchases works')).toBeVisible();
  await expect(page.getByTestId('example-goal')).toBeVisible();
  await expect(page.getByTestId('example-goal')).toContainText('Example');
  await expect(page.getByText('Start a goal')).toBeVisible();
  await expect(page.getByText('A personal planning tool, not financial advice. Numbers come from what you entered.')).toBeVisible();
  await page.getByTestId('example-goal').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Create from the starter tile's Vehicle row.
  await page.getByTestId('starter-tile').getByRole('button', { name: /Vehicle/ }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByRole('radio', { name: 'Vehicle' })).toHaveAttribute('aria-checked', 'true');
  await form.getByLabel('Name').fill('Test vehicle');
  await form.getByLabel('Target amount').fill('200000000');
  await form.getByLabel('Target month').fill(month.input);
  await expect(form.getByTestId('goal-form-preview')).toHaveText(monthly);
  await form.getByRole('button', { name: 'Create goal' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(page.getByText('How Big Purchases works')).toHaveCount(0);
  await expect(page.getByTestId('example-goal')).toHaveCount(0);
  const card = page.getByTestId('goal-card').filter({ hasText: 'Test vehicle' });
  await expect(card.getByTestId('goal-next-step')).toHaveText(monthly);

  // No savings valuation, so the gate cannot be green (FIN-04).
  const gate = card.locator('[data-gate-state]');
  await expect(gate).toBeVisible();
  await expect(gate).not.toHaveText('Foundation checked');

  // Contribution from the card's "+ Add": the drawer must not open.
  await card.getByRole('button', { name: 'Add', exact: true }).click();
  const contribution = page.getByRole('dialog');
  await expect(contribution.getByRole('heading', { name: 'Record contribution' })).toBeVisible();
  await contribution.getByLabel('Amount', { exact: true }).fill('50000000');
  await expect(contribution.getByTestId('contribution-preview')).toHaveText('Becomes Rp 50.000.000 · 25%');
  await contribution.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(card.getByTestId('goal-allocated')).toHaveText('Rp 50 jt');
  await expect(card.getByTestId('goal-target')).toHaveText('of Rp 200 jt');

  // The drawer lists the contribution in full.
  await card.click();
  const drawer = page.getByRole('dialog', { name: 'Test vehicle' });
  await expect(drawer.getByTestId('drawer-contributions')).toContainText('Rp 50.000.000');

  // A withdrawal above what is set aside is flagged and cannot be saved.
  await drawer.getByRole('button', { name: 'Record contribution' }).click();
  const withdraw = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /Record (contribution|withdrawal)/ }) });
  await withdraw.getByRole('radio', { name: 'Withdraw' }).click();
  await withdraw.getByLabel('Amount', { exact: true }).fill('60000000');
  await expect(withdraw.getByRole('alert')).toHaveText('Only Rp 50.000.000 is set aside for this goal.');
  await expect(withdraw.getByRole('button', { name: 'Save' })).toBeDisabled();
  await withdraw.getByRole('button', { name: 'Cancel' }).click();

  // Mark achieved: it moves to the Achieved tab.
  await drawer.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Mark achieved' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('goal-card').filter({ hasText: 'Test vehicle' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Achieved' }).click();
  await expect(page).toHaveURL(/\/big-purchases\/achieved$/);
  const achieved = page.getByTestId('goal-card').filter({ hasText: 'Test vehicle' });
  await expect(achieved.getByTestId('goal-closed-line')).toHaveText(/^Achieved \d{1,2} [A-Z][a-z]{2} \d{4}$/);

  // Delete through the confirm dialog.
  await achieved.click();
  await page.getByRole('dialog', { name: 'Test vehicle' }).getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Goals you mark achieved or cancel land here.')).toBeVisible();
});
