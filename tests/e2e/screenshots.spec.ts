import path from 'node:path';
import { expect, test } from '@playwright/test';

/** Captures README screenshots into docs/screenshots. Run with: pnpm --filter @nova/e2e screenshots */
const out = (name: string) => path.resolve(__dirname, '../../docs/screenshots', `${name}.png`);

test('capture workspace screenshots', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/studio');
  await expect(page.getByRole('region', { name: /urgent attention/i })).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('01-pulse') });

  await page
    .getByRole('button', { name: /Woven Light/ })
    .first()
    .click();
  await page
    .getByRole('complementary', { name: 'Inspector' })
    .getByRole('tab', { name: 'Workflow' })
    .click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: out('02-project-workflow') });

  await page
    .getByRole('complementary', { name: 'Inspector' })
    .getByRole('tab', { name: 'Tasks' })
    .click();
  await page.getByRole('radio', { name: 'Dependencies' }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out('03-dependency-graph') });

  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.keyboard.press('2');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('04-productions') });

  await page.keyboard.press('3');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('05-schedule'), fullPage: true });

  await page.keyboard.press('4');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('06-people') });

  await page
    .getByRole('navigation', { name: 'Workspace lenses' })
    .getByRole('button', { name: 'Intelligence', exact: true })
    .click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out('07-business'), fullPage: true });

  await page.keyboard.press('1');
  await page.keyboard.press('Control+j');
  const nova = page.getByRole('complementary', { name: 'NOVA assistant' });
  await nova
    .getByLabel('Message NOVA')
    .fill('Create a task "Final mix review" for Woven Light due Friday for Sreejith');
  await nova.getByLabel('Message NOVA').press('Enter');
  await expect(nova.getByText('Awaiting your confirmation').last()).toBeVisible();
  await page.screenshot({ path: out('08-nova-proposal') });

  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Search, jump to a lens/).fill('sound');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('09-command-palette') });
  await page.keyboard.press('Escape');

  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('10-light-theme') });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
});

test('capture login screenshot', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto('/login');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('00-login') });
  await context.close();
});
