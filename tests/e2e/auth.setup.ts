import { expect, test as setup } from '@playwright/test';

/** Signs in once as the seeded administrator and stores the session for the other projects. */
setup('sign in as administrator', async ({ page }) => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env');
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /enter the studio/i }).click();
  // Generous timeout: against `next dev` the first request compiles the route.
  await expect(page).toHaveURL(/\/studio/, { timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Production pipeline' })).toBeVisible();
  await page.context().storageState({ path: '.auth/admin.json' });
});
