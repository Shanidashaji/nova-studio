import { expect, test, type Page } from '@playwright/test';

/** ERP lenses inside the single workspace: each opens in the same shell, with live data. */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, 'uncaught page errors').toEqual([]));

async function openLens(page: Page, label: string) {
  await page.goto('/studio');
  await page
    .getByRole('navigation', { name: 'Workspace lenses' })
    .getByRole('button', { name: label, exact: true })
    .click();
}

test('the sidebar groups the ERP lenses inside one workspace', async ({ page }) => {
  await page.goto('/studio');
  const nav = page.getByRole('navigation', { name: 'Workspace lenses' });
  for (const group of ['Operate', 'Business', 'Knowledge', 'Account']) {
    await expect(nav.getByRole('group', { name: group })).toBeVisible();
  }
  for (const label of [
    'Finance',
    'Procurement',
    'Inventory',
    'Approvals',
    'Documents',
    'Settings',
  ]) {
    await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
});

test('finance shows receivables, invoices and expenses from the API', async ({ page }) => {
  await openLens(page, 'Finance');
  await expect(page.getByText('Demonstration data.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();
  await expect(page.getByText(/NM-INV-\d{4}-\d{3}/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Expenses', exact: true })).toBeVisible();
});

test('a submitted expense reaches the approvals inbox and can be approved', async ({ page }) => {
  const title = `E2E taxi ${Date.now()}`;
  await openLens(page, 'Finance');
  await page.getByRole('button', { name: 'Expense', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Submit an expense' });
  await dialog.getByLabel('What was it for?').fill(title);
  await dialog.getByLabel('Amount (₹)').fill('1200');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Expense submitted for approval')).toBeVisible();

  // The administrator raised it, so the inbox must refuse self-approval.
  await openLens(page, 'Approvals');
  await page.getByRole('button', { name: /Raised by me/ }).click();
  const row = page.getByRole('listitem').filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row.getByText('You cannot approve your own request.')).toBeVisible();
});

test('settings shows the permission matrix and keeps Super Admin locked', async ({ page }) => {
  await openLens(page, 'Settings');
  await page.getByRole('radio', { name: 'Roles & permissions' }).click();
  await expect(page.getByText('Locked system role')).toBeVisible();
  await page
    .getByRole('main')
    .getByRole('button', { name: /^Finance\s*\d+$/ })
    .click();
  await expect(page.getByRole('checkbox', { name: 'Approve expenses' })).toBeChecked();
  await page.getByRole('radio', { name: 'Approval rules' }).click();
  await expect(page.getByText('Finance review (₹50,000+)')).toBeVisible();
});

test('procurement, inventory and documents render live records', async ({ page }) => {
  await openLens(page, 'Procurement');
  await expect(page.getByText(/PR-\d{4} · /).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Purchase orders' })).toBeVisible();

  await openLens(page, 'Inventory');
  await expect(page.getByRole('heading', { name: 'Stock', exact: true })).toBeVisible();
  await expect(page.getByText(/at or below reorder level/)).toBeVisible();

  await openLens(page, 'Documents');
  await expect(page.getByText('Creative brief — Woven Light')).toBeVisible();
  const download = page.waitForEvent('download');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Creative brief — Woven Light' })
    .getByRole('link', { name: 'Download' })
    .click();
  expect((await download).suggestedFilename()).toBe('woven-light-brief.md');
});

test('studios and leave live inside the existing Resources and Team lenses', async ({ page }) => {
  await openLens(page, 'Resources');
  await expect(page.getByRole('heading', { name: 'Studios', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Studio A — Cyclorama' })).toBeVisible();

  await openLens(page, 'Creative Team');
  await expect(page.getByRole('heading', { name: 'Time off', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Departments', exact: true })).toBeVisible();
  await expect(page.getByText(/^Post-production · lead/)).toBeVisible();
});
