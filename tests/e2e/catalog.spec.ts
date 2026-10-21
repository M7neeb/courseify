import { test, expect } from '@playwright/test';
import { CATALOG_INFO } from '../../src/core/catalogEntries.ts';

// A first start with nothing stored: every course that comes with the app is in the library.
test.use({ storageState: { cookies: [], origins: [] } });

test('the courses that come with the app are installed on the first start, and a removed one stays removed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./#/library');
  for (const entry of CATALOG_INFO) {
    await expect(page.getByRole('main').getByRole('heading', { name: entry.title, exact: true }).first()).toBeVisible();
  }
  // In the library already, so the ready-made list has nothing left to add.
  await expect(page.getByRole('button', { name: 'Add to my courses' })).toHaveCount(0);
  await expect(page.getByText('In your library', { exact: true })).toHaveCount(CATALOG_INFO.length);

  // Deleting one moves it to the trash, and a new start does not put it back: it is offered instead.
  const card = page.locator('.course-card, li, article').filter({ has: page.getByRole('heading', { name: 'Das Pflichtenheft verstehen', exact: true }) }).filter({ has: page.getByLabel('More course actions') }).last();
  await card.getByLabel('More course actions').click();
  page.once('dialog', (dialog) => void dialog.accept());
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add to my courses' })).toHaveCount(1);
  await expect(page.locator('.cf-catalog-item', { hasText: 'Das Pflichtenheft verstehen' }).getByRole('button', { name: 'Add to my courses' })).toBeVisible();
  expect(errors).toEqual([]);
});
