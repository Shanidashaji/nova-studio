import { expect, test } from '@playwright/test';

test('the workspace is usable on a phone', async ({ page }) => {
  await page.goto('/studio');
  await expect(page.getByRole('navigation', { name: 'Workspace lenses' })).toBeVisible();
  // No horizontal page scroll at phone width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page
    .getByRole('navigation', { name: 'Workspace lenses' })
    .getByRole('button', { name: 'Projects' })
    .click();
  await page.getByRole('button', { name: 'Woven Light' }).first().click();
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Open NOVA assistant' }).click();
  await expect(page.getByRole('complementary', { name: 'NOVA assistant' })).toBeVisible();
});
