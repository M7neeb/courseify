import { test, expect } from '@playwright/test';

// The smallest phones still in use are 360 px wide (320 with large text). Nothing may hide off
// the side of the screen there: a page that scrolls sideways or a tab you cannot see is a bug.
test.use({ viewport: { width: 360, height: 740 } });

for (const route of ['home', 'library', 'review', 'stats', 'drills', 'play', 'play/games', 'play/endgames', 'settings', 'prompt', 'import', 'profile']) {
  test(`#/${route} does not scroll sideways on a 360 px phone`, async ({ page }) => {
    await page.goto(`./#/${route}`);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('every chess tab is fully on screen on a 360 px phone, in English and German', async ({ page }) => {
  for (const lang of ['en', 'de']) {
    await page.goto('./#/play/endgames');
    if (lang === 'de') {
      await page.goto('./#/settings');
      await page.getByLabel('App language').selectOption('de');
      await page.goto('./#/play/endgames');
      await expect(page.locator('.cf-chess-tabs a').first()).toHaveText('Gegen Bots');
    }
    const tabs = page.locator('.cf-chess-tabs a');
    await expect(tabs).toHaveCount(4);
    for (const box of await tabs.evaluateAll((links) => links.map((a) => a.getBoundingClientRect().toJSON()))) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(360);
    }
    const nav = page.locator('.cf-chess-tabs');
    expect(await nav.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(0);
  }
});
