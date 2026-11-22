import { expect, test, type Page } from '@playwright/test';

test.describe('authentication', () => {
  test('redirects signed-out visitors to the login page', async ({ page }) => {
    await page.goto('/studio');
    await expect(page).toHaveURL(/\/login\?next=%2Fstudio/);
    await expect(page.getByRole('heading', { name: 'Sign in to NOVA' })).toBeVisible();
  });

  test('shows a generic error for wrong credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(process.env.SEED_ADMIN_EMAIL!);
    await page.getByLabel('Password').fill('definitely-wrong');
    await page.getByRole('button', { name: /enter the studio/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'incorrect' })).toHaveText(
      'The email or password is incorrect.',
    );
  });

  test('validates the form before submitting', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /enter the studio/i }).click();
    await expect(page.getByText('This field is required.')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: /enter the studio/i }).click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  });

  test('login → dashboard → sign out → back/direct access blocked → login again', async ({
    page,
    context,
  }) => {
    // Something in history before the workspace, so Back has somewhere to go.
    await page.goto('/login');
    await signIn(page);
    // A second workspace entry in history, which Back would normally return to.
    await page.goto('/studio?lens=productions');
    await expect(accountMenu(page)).toBeVisible();

    await accountMenu(page).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('You have been signed out of NOVA.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in to NOVA' })).toBeVisible();
    expect((await context.cookies()).some((c) => c.name === 'nova_session')).toBe(false);

    // The API no longer accepts the old session.
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);

    // Back does not reopen the workspace.
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await expect(accountMenu(page)).toHaveCount(0);

    // Neither does typing the dashboard address.
    await page.goto('/studio');
    await expect(page).toHaveURL(/\/login\?next=%2Fstudio/);
    await expect(accountMenu(page)).toHaveCount(0);

    // And signing in again works.
    await signIn(page);
    await expect(accountMenu(page)).toBeVisible();
  });

  test('signs out from the command palette', async ({ page }) => {
    await page.goto('/login');
    await signIn(page);
    await page.keyboard.press('Control+k');
    await page.getByRole('option', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('You have been signed out of NOVA.')).toBeVisible();
    await page.goto('/studio');
    await expect(page).toHaveURL(/\/login/);
  });

  test('signs out other open tabs too', async ({ context }) => {
    const first = await context.newPage();
    await first.goto('/login');
    await signIn(first);
    const second = await context.newPage();
    await second.goto('/studio');
    await expect(accountMenu(second)).toBeVisible();

    await accountMenu(first).click();
    await first.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(first).toHaveURL(/\/login/);
    await expect(second).toHaveURL(/\/login/);
  });

  test('stays signed in and reports the error when sign-out fails', async ({ page }) => {
    await page.goto('/login');
    await signIn(page);
    await page.route('**/api/v1/auth/logout', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Server unavailable.' } }),
      }),
    );
    await accountMenu(page).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByText('Could not sign out')).toBeVisible();
    await expect(page).toHaveURL(/\/studio/);

    // Retry once the server is back.
    await page.unroute('**/api/v1/auth/logout');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

const accountMenu = (page: Page) => page.getByRole('button', { name: /Account menu/ });

async function signIn(page: Page) {
  await page.getByLabel('Email').fill(process.env.SEED_ADMIN_EMAIL!);
  await page.getByLabel('Password').fill(process.env.SEED_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /enter the studio/i }).click();
  await expect(page).toHaveURL(/\/studio/);
}
