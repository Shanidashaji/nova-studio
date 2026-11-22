import { expect, test, type Page } from '@playwright/test';

/** The production-studio layer: every new lens opens with live data and its main controls work. */

const SHOTS = process.env.E2E_SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};
const openLens = (page: Page, label: string) =>
  page.getByRole('navigation', { name: 'Workspace lenses' }).getByRole('button', { name: label, exact: true }).click();
const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

test.beforeEach(async ({ page }) => {
  await page.goto('/studio');
  await expect(page.getByRole('region', { name: 'Production pipeline' })).toBeVisible({ timeout: 60_000 });
});

test('command centre shows attention, today and availability', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Attention required' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Shooting today' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Studio availability' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Overdue tasks/ })).toBeVisible();
  await shot(page, '01-command-center');
});

test('shoot day: scenes, log and call sheet', async ({ page }) => {
  await openLens(page, 'Shoot Day');
  await expect(page.getByRole('tab', { name: /Scenes/ })).toBeVisible({ timeout: 30_000 });
  await shot(page, '02-shoot-day');
  await page.getByRole('tab', { name: /Log/ }).click();
  await page.getByLabel('What happened').fill('E2E: light stand missing');
  await page.getByRole('button', { name: 'Add to log' }).click();
  await expect(page.getByText('E2E: light stand missing')).toBeVisible();
  await page.getByRole('tab', { name: /Call sheet/ }).click();
  await expect(page.getByRole('heading', { name: 'Running order' })).toBeVisible();
  await page.getByRole('tab', { name: /Readiness/ }).click();
  await expect(page.getByText('Equipment booked')).toBeVisible();
  await page.getByRole('tab', { name: /Cast & crew/ }).click();
  await expect(page.getByRole('heading', { name: 'Find artists and crew' })).toBeVisible();
  await page.getByLabel('Part or character').fill('Nurse');
  await page.getByRole('button', { name: 'Recommend' }).click();
  await expect(page.getByText(/Rule-based ranking, not AI/)).toBeVisible();
  await shot(page, '03-recommendations');
});

test('shoot calendar views', async ({ page }) => {
  await openLens(page, 'Shoot Calendar');
  for (const v of ['Day', 'Week', 'Month', 'Timeline']) {
    await page.getByRole('radio', { name: v, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
  }
  await page.getByRole('radio', { name: 'Week', exact: true }).click();
  await shot(page, '04-calendar-week');
});

test('scripts: read, breakdown preview and pre-production readiness', async ({ page }) => {
  await openLens(page, 'Scripts');
  await page.getByRole('button', { name: /A Day of Care.*Approved|A Day of Care/ }).first().click();
  await expect(page.getByRole('tab', { name: /Scene breakdown/ })).toBeVisible();
  await page.getByRole('tab', { name: /Scene breakdown/ }).click();
  await page.getByRole('button', { name: 'Run rule-based breakdown' }).click();
  await expect(page.getByText(/Rule-based breakdown, not AI/)).toBeVisible();
  await shot(page, '05-script-breakdown');
  await page.getByRole('tab', { name: 'Pre-production readiness' }).click();
  await expect(page.getByText('Scene breakdown').first()).toBeVisible();
});

test('artists and crew roster', async ({ page }) => {
  await openLens(page, 'Artists & Crew');
  const meera = page.getByRole('button', { name: /Meera Krishnan/ }).first();
  await expect(meera).toBeVisible({ timeout: 30_000 });
  await meera.click();
  await expect(page.getByRole('complementary', { name: 'Inspector' }).getByText('Upcoming bookings', { exact: false })).toBeVisible();
  await shot(page, '06-talent');
});

test('tasks: board, list and calendar', async ({ page }) => {
  await openLens(page, 'Tasks');
  await expect(page.getByRole('region', { name: 'To do' })).toBeVisible({ timeout: 30_000 });
  await shot(page, '07-tasks-board');
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByRole('columnheader', { name: 'Task' })).toBeVisible();
  await page.getByRole('radio', { name: 'Calendar' }).click();
  await expect(page.getByRole('button', { name: 'This month' })).toBeVisible();
});

test('post-production and reviews board', async ({ page }) => {
  await openLens(page, 'Post & Reviews');
  await expect(page.getByRole('heading', { name: 'Editors' })).toBeVisible({ timeout: 30_000 });
  await shot(page, '08-post');
});

test('client communications: messages and templates', async ({ page }) => {
  await openLens(page, 'Client Comms');
  await expect(page.getByText(/Email:/)).toBeVisible({ timeout: 30_000 });
  await shot(page, '09-comms');
  await page.getByRole('tab', { name: 'Templates & automation' }).click();
  await expect(page.getByText('Shoot reminder (day before)')).toBeVisible();
});

test('reports and capacity', async ({ page }) => {
  await openLens(page, 'Reports');
  await expect(page.getByText('Can the studio take another project?')).toBeVisible({ timeout: 30_000 });
  await shot(page, '10-capacity');
  await page.getByRole('tab', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: 'Project performance' })).toBeVisible();
  await shot(page, '11-reports');
});

test('new lenses fit a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const lens of ['Shoot Day', 'Tasks', 'Scripts', 'Client Comms', 'Reports', 'Post & Reviews', 'Artists & Crew', 'Shoot Calendar']) {
    const button = page.getByRole('navigation', { name: 'Workspace lenses' }).getByRole('button', { name: lens, exact: true });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await page.waitForTimeout(800);
    await noOverflow(page);
    await shot(page, `phone-${lens.replace(/\W+/g, '-').toLowerCase()}`);
  }
});
