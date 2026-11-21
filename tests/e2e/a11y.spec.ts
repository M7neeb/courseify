import { test, expect } from '@playwright/test';

// Found by an axe audit of the main screens: every progress bar has a name, the profile button's
// name starts with the name it shows, the activity days are announced, and the sideways-scrolling
// calendar can be reached with the keyboard.
test('progress bars, the profile button and the activity calendar can be read out', async ({ page }) => {
  await page.goto('./#/stats');
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
  for (const route of ['home', 'stats']) {
    await page.goto(`./#/${route}`);
    await expect(page.locator('main')).toBeVisible();
    const unnamed = await page.locator('[role="progressbar"]').evaluateAll((bars) =>
      bars.filter((b) => !(b.getAttribute('aria-label') || b.getAttribute('aria-labelledby'))).length
    );
    expect(unnamed, route).toBe(0);
  }

  const summary = page.locator('.cf-user summary');
  const shown = (await summary.locator('.cf-user-name').innerText()).trim();
  expect(await summary.getAttribute('aria-label')).toMatch(new RegExp(`^${shown}`));

  await page.goto('./#/stats');
  await expect(page.getByRole('region', { name: 'Activity' })).toHaveAttribute('tabindex', '0');
  expect(await page.locator('.day-square[aria-label]:not([role="img"])').count()).toBe(0);
});
