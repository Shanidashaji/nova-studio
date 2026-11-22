import { expect, test, type Page } from '@playwright/test';

/**
 * Regressions found in the November 2026 audit (ERP_COMPLETE_AUDIT_REPORT.md). Each test names
 * the behaviour that was broken. They create at most one task and remove it again.
 */

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Workspace lenses' });

async function openLens(page: Page, lens: string) {
  await page.goto(lens === 'pulse' ? '/studio' : `/studio?lens=${lens}`);
  await expect(nav(page)).toBeVisible();
  await expect(page.locator('#workspace [aria-busy]')).toHaveCount(0, { timeout: 20_000 });
}

test('a task can be added with assignee and due date left blank, then deleted', async ({
  page,
}) => {
  const title = `Regression task ${Date.now().toString(36)}`;
  await openLens(page, 'productions');
  await page.locator('#workspace').getByRole('button', { name: 'Woven Light' }).first().click();
  const panel = inspector(page);
  await panel.getByRole('tab', { name: /^Tasks/ }).click();
  await panel.getByRole('button', { name: /Task/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByRole('button', { name: title })).toBeVisible();

  await panel.getByRole('button', { name: title }).click();
  await panel.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete task' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(panel.getByRole('button', { name: title })).toHaveCount(0);
});

test('the focus bar is visible while a focus is set and clears it', async ({ page }) => {
  await openLens(page, 'pulse');
  await page
    .getByRole('region', { name: 'Production pipeline' })
    .getByRole('button', { name: /Focus the workspace on Edit/ })
    .click();
  const bar = page.getByRole('status').filter({ hasText: 'Focused on' });
  await expect(bar).toBeVisible();
  // It used to collapse to zero height inside the scrolling column.
  expect((await bar.boundingBox())!.height).toBeGreaterThan(24);
  await expect(page).toHaveURL(/focus=stage/);
  await page.getByRole('button', { name: 'Clear focus' }).click();
  await expect(bar).toBeHidden();
  await expect(page).not.toHaveURL(/focus=/);
});

test('form errors tell the user what to do, not how the schema is written', async ({ page }) => {
  await openLens(page, 'productions');
  await page.getByRole('button', { name: /New production/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Open production/ }).click();
  await expect(dialog.getByText('This field is required.').first()).toBeVisible();
  await expect(dialog.getByText('Choose an option.').first()).toBeVisible();
  await expect(dialog.getByText(/expected one of|Too small|Invalid input/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('a link to an unknown lens or inspector opens Home with nothing inspected', async ({
  page,
}) => {
  await page.goto('/studio?lens=not-a-lens&inspect=bogus:1');
  await expect(page.getByRole('region', { name: 'Welcome' })).toBeVisible();
  await expect(inspector(page)).toBeHidden();
});

test('the schedule window moves and returns to today', async ({ page }) => {
  await openLens(page, 'schedule');
  const range = page.locator('#workspace p[aria-live="polite"]').first();
  const today = await range.innerText();
  await page.getByRole('button', { name: 'Later weeks' }).click();
  await expect(range).not.toHaveText(today);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(range).toHaveText(today);
});

test('the command palette offers hotkey hints only for lenses that have one', async ({ page }) => {
  await openLens(page, 'pulse');
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  // Thirteen lenses, hotkeys 1–9: Settings is the thirteenth and must not claim a key.
  await expect(palette.getByRole('option', { name: /^Settings/ })).not.toContainText(/1[0-3]/);
  await expect(palette.getByRole('option', { name: /^Home/ })).toContainText('1');
});
