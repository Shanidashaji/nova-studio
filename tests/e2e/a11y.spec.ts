import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Automated WCAG 2.1 A/AA checks (axe-core) on each lens and the main overlays.
 * Automated checks catch a subset of issues; keyboard paths are covered by the journey tests.
 */
async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Decorative SVG stills are aria-labelled images; React Flow internals are excluded.
    .exclude('.react-flow__renderer')
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const summary = serious.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(' ')}`,
  );
  expect(summary, `${label} has serious accessibility violations`).toEqual([]);
}

test('login page', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await audit(page, 'Login');
  await context.close();
});

/** Every lens, opened by its URL so the list does not depend on hotkey numbering. */
const LENSES = [
  ['pulse', 'Command Center'],
  ['productions', 'Projects'],
  ['schedule', 'Shoot Calendar'],
  ['shootday', 'Shoot Day'],
  ['scripts', 'Scripts'],
  ['talent', 'Artists & Crew'],
  ['post', 'Post & Reviews'],
  ['tasks', 'Tasks'],
  ['comms', 'Client Comms'],
  ['reports', 'Reports'],
  ['people', 'Creative Team'],
  ['clients', 'Clients'],
  ['finance', 'Finance'],
  ['procurement', 'Procurement'],
  ['inventory', 'Inventory'],
  ['approvals', 'Approvals'],
  ['documents', 'Documents'],
  ['business', 'Intelligence'],
  ['activity', 'Activity'],
  ['settings', 'Settings'],
] as const;

async function openLens(page: Page, lens: string) {
  await page.goto(lens === 'pulse' ? '/studio' : `/studio?lens=${lens}`);
  await expect(page.getByRole('region', { name: 'Production pipeline' })).toBeVisible();
  // Panels announce loading with aria-busy; audit the loaded lens, not its skeleton.
  await expect(page.locator('#workspace [aria-busy]')).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(600);
}

for (const [lens, name] of LENSES) {
  test(`${name} lens`, async ({ page }) => {
    await openLens(page, lens);
    await audit(page, name);
  });
}

for (const lens of ['pulse', 'schedule', 'people', 'finance', 'settings']) {
  test(`dark theme · ${lens}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('nova-theme-v2', 'dark'));
    await openLens(page, lens);
    await expect(page.locator('html[data-theme="dark"]')).toHaveCount(1);
    await audit(page, `Dark theme ${lens}`);
  });
}

test('project inspector and command palette', async ({ page }) => {
  await page.goto('/studio');
  await page
    .getByRole('button', { name: /Woven Light/ })
    .first()
    .click();
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
  await page.waitForTimeout(400);
  await audit(page, 'Project inspector');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await audit(page, 'Command palette');
});
