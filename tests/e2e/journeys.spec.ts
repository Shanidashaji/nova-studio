import { expect, test, type Page } from '@playwright/test';

/** The interview demo journeys from docs/research/02-problem-space-and-concept.md §5. */

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const nova = (page: Page) => page.getByRole('complementary', { name: 'NOVA assistant' });
/** Opens a lens from the sidebar by its label (hotkeys only cover the first nine). */
const lens = (page: Page, label: string) =>
  page
    .getByRole('navigation', { name: 'Workspace lenses' })
    .getByRole('button', { name: label, exact: true })
    .click();

test.beforeEach(async ({ page }) => {
  await page.goto('/studio');
  await expect(page.getByRole('region', { name: 'Production pipeline' })).toBeVisible();
});

test('1 · morning check: the attention queue explains itself and opens the work', async ({
  page,
}) => {
  const queue = page.getByRole('region', { name: /urgent attention/i });
  await expect(queue.getByText(/Unboxing Reels is \d+ days? overdue/)).toBeVisible();
  await expect(queue.getByText(/Client approval waiting \d+ days — Feel the Sound/)).toBeVisible();
  await expect(queue.getByText('Sony FX6 — A-cam is double-booked')).toBeVisible();

  await queue.getByRole('button', { name: /Colour grade is blocked/ }).click();
  await expect(inspector(page).getByRole('heading', { name: 'Colour grade' })).toBeVisible();
  await expect(inspector(page).getByText(/Blocked: Waiting on sky replacement/)).toBeVisible();
});

test('2 · workflow: a blocked stage names its blockers; finishing the work lets it advance', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Projects' }).first().click();
  await page.getByRole('heading', { name: 'Product Demo v4' }).getByRole('button').click();
  const panel = inspector(page);
  await panel.getByRole('tab', { name: 'Workflow' }).click();
  await expect(panel.getByText('NOVA is holding this stage')).toBeVisible();
  await expect(panel.getByRole('button', { name: /Complete delivery|Advance/ })).toBeDisabled();

  // Finish the blocking tasks in order (each depends on the previous).
  await panel.getByRole('tab', { name: 'Tasks' }).click();
  for (const title of ['Export masters and cut-downs', 'Quality check', 'Upload and handover']) {
    const select = panel.getByLabel(`Status of ${title}`);
    if ((await select.inputValue()) !== 'DONE') {
      await select.selectOption('DONE');
      await expect(page.getByText(`“${title}” → Done`)).toBeVisible();
    }
  }
  await panel.getByRole('tab', { name: 'Workflow' }).click();
  await panel.getByRole('button', { name: 'Complete delivery' }).click();
  await expect(page.getByText('Product Demo v4 delivered')).toBeVisible();
});

test('3 · schedule: double bookings are visible and booking a clash is refused', async ({
  page,
}) => {
  await page.keyboard.press('3');
  await expect(page.getByRole('alert').filter({ hasText: 'Sony FX6 — A-cam' })).toBeVisible();
  await page
    .getByRole('region', { name: 'Shoots' })
    .getByRole('button', { name: /Beach reels/ })
    .click();
  const panel = inspector(page);
  await expect(panel.getByText('Double-booked', { exact: true }).first()).toBeVisible();
  await panel.getByLabel('Equipment', { exact: true }).selectOption({ label: 'DJI Inspire 3' });
  await panel.getByRole('button', { name: 'Book equipment' }).click();
  await expect(panel.getByText(/already booked for “Aerial and golden hour”/)).toBeVisible();
});

test('4 · NOVA answers from live data and only changes data after confirmation', async ({
  page,
}) => {
  await page.keyboard.press('Control+j');
  const panel = nova(page);
  await panel.getByLabel('Message NOVA').fill('Which workflows are blocked?');
  await panel.getByLabel('Message NOVA').press('Enter');
  // `.last()`: the conversation is kept between visits, so earlier answers may be on screen.
  await expect(
    panel.getByText(/“Colour grade” is blocked and holds the stage/).last(),
  ).toBeVisible();

  await panel
    .getByLabel('Message NOVA')
    .fill('Create a task "Archive project files" for Woven Light due Friday for Divya');
  await panel.getByLabel('Message NOVA').press('Enter');
  const card = panel.getByText('Proposed action').last().locator('..');
  await expect(card.getByText('Awaiting your confirmation')).toBeVisible();
  await expect(card.getByText('Divya Raghavan (Editor)')).toBeVisible();
  await card.getByRole('button', { name: 'Confirm' }).click();
  await expect(card.getByText('Applied · recorded in activity')).toBeVisible();

  await lens(page, 'Activity');
  await expect(
    page.getByText(/added “Archive project files” to Woven Light for Divya Raghavan/).first(),
  ).toBeVisible();
});

test('5 · focus: selecting a stage narrows every lens', async ({ page }) => {
  await page.getByRole('button', { name: /Focus the workspace on Review/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Focused on' })).toContainText('Review');
  await page.keyboard.press('2');
  await expect(
    page
      .getByRole('heading', { name: 'Feel the Sound' })
      .or(page.getByRole('button', { name: 'Feel the Sound' }))
      .first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Woven Light', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear focus' }).click();
});

test('command palette searches across the studio', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await dialog.getByPlaceholder(/Search, jump to a lens/).fill('aurora');
  const client = dialog.getByRole('option', { name: /^Aurora Threads D2C fashion/ });
  await expect(client).toBeVisible();
  await client.click();
  await expect(inspector(page).getByRole('heading', { name: 'Aurora Threads' })).toBeVisible();
});

test('business lens is clearly marked as demonstration data', async ({ page }) => {
  await lens(page, 'Intelligence');
  await expect(page.getByRole('note')).toContainText('Demonstration data');
  await expect(page.getByRole('img', { name: /Monthly income and expenses/ })).toBeVisible();
});
