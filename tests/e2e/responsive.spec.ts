import { expect, test, type Page } from '@playwright/test';

/**
 * Layout at the supported widths, from a small phone to a desktop. Every lens must fit the
 * viewport: wide tables scroll inside their own panel, never the page.
 */

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1280, 1440];
const LENSES = [
  'pulse',
  'productions',
  'schedule',
  'shootday',
  'scripts',
  'talent',
  'post',
  'tasks',
  'comms',
  'reports',
  'people',
  'clients',
  'finance',
  'procurement',
  'inventory',
  'approvals',
  'documents',
  'business',
  'activity',
  'settings',
];

async function openLens(page: Page, lens: string) {
  await page.goto(lens === 'pulse' ? '/studio' : `/studio?lens=${lens}`);
  await expect(page.getByRole('navigation', { name: 'Workspace lenses' })).toBeVisible();
  await expect(page.locator('#workspace [aria-busy]')).toHaveCount(0, { timeout: 20_000 });
}

for (const width of WIDTHS) {
  test(`no horizontal page scroll at ${width}px, on any lens`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width < 768 ? 780 : 900 });
    const overflowing: string[] = [];
    for (const lens of LENSES) {
      await openLens(page, lens);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1) overflowing.push(`${lens} (+${overflow}px)`);
    }
    expect(overflowing).toEqual([]);
  });
}

for (const width of [320, 390]) {
  test(`phone layout at ${width}px: navigation, dialog and inspector fit the screen`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 });
    await openLens(page, 'productions');

    // The bottom tab bar scrolls sideways; the last lens must still be reachable.
    const settings = page
      .getByRole('navigation', { name: 'Workspace lenses' })
      .getByRole('button', { name: 'Settings', exact: true });
    await settings.scrollIntoViewIfNeeded();
    await settings.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

    await openLens(page, 'productions');
    await page.getByRole('button', { name: /New production/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(780);
    await expect(dialog.getByRole('button', { name: /Open production/ })).toBeInViewport();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await page.locator('#workspace').getByRole('button', { name: 'Woven Light' }).first().click();
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    await expect(inspector).toBeVisible();
    const panel = (await inspector.boundingBox())!;
    expect(panel.x + panel.width).toBeLessThanOrEqual(width + 1);
    await page.getByRole('button', { name: 'Close inspector' }).click();
    await expect(inspector).toBeHidden();
  });
}
