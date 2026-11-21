import { test, expect } from '@playwright/test';

// The study Review page once picked up the chess game review's two-column grid through a shared
// class name, which pushed its cards to the far right, away from their headings.
test('the review page lines its cards up under the headings', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto('./#/review');
  const title = page.getByRole('heading', { level: 1 });
  const card = page.locator('.cf-today-review');
  await expect(card).toBeVisible();
  const [titleBox, cardBox] = [await title.boundingBox(), await card.boundingBox()];
  expect(Math.abs(cardBox!.x - titleBox!.x)).toBeLessThan(4);
  expect(cardBox!.y).toBeGreaterThan(titleBox!.y + titleBox!.height - 1);
});
