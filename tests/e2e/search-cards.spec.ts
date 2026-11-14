import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const sampleCourse = fileURLToPath(new URL('../../examples/sample-course.json', import.meta.url));

async function importSample(page: import('@playwright/test').Page) {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(sampleCourse);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported “Networking basics”.')).toBeVisible();
}

test('search finds a lesson by words in its text and opens it', async ({ page, isMobile }) => {
  await importSample(page);
  await page.goto('./#/home');

  if (isMobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  const box = page.getByRole('searchbox').and(page.locator(':visible'));
  await box.fill('four layers');
  const hit = page.getByRole('button', { name: /The TCP\/IP layers/ });
  await expect(hit).toContainText('splits communication into four layers');
  await hit.click();

  await expect(page).toHaveURL(/#\/course\/networking-basics\/m1-l2/);
  await expect(page.getByRole('heading', { name: 'The TCP/IP layers' })).toBeVisible();
});

test('the flashcard deck brings a missed card back and ends when all are known', async ({ page }) => {
  await importSample(page);
  await page.goto('./#/cards/networking-basics');
  await expect(page.getByRole('heading', { name: 'Flashcards' })).toBeVisible();
  await expect(page.getByText('0 of 2 known')).toBeVisible();

  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Practice again' }).click();
  await expect(page.getByText('0 of 2 known')).toBeVisible();

  // Second card known, then the missed one again.
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: 'Got it' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Deck done' })).toBeVisible();
  await expect(page.getByText('1 of 2 cards known on the first try.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Repeat the 1 you missed' })).toBeVisible();
});

test('number keys pick an answer and Enter checks it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await importSample(page);
  await page.goto('./#/exercise/networking-basics/m1-l1');
  const options = page.getByRole('radio');
  await expect(options.first()).toBeVisible();
  await expect(page.locator('article.question')).toHaveAttribute('data-state', 'open');

  await page.keyboard.press('2');
  await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('3');
  await expect(options.nth(2)).toHaveAttribute('aria-checked', 'true');
  await expect(options.nth(1)).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Enter');
  await expect(page.locator('article.question')).not.toHaveAttribute('data-state', 'open');
});
