import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const et = fileURLToPath(new URL('../../courses/elektrotechnik-grundlagen.json', import.meta.url));

test('the cheat sheet opens from a unit, shows its formulas and warnings, and covers the whole course on request', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(et);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText(/Imported/)).toBeVisible();

  await page.goto('./#/unit/elektrotechnik-grundlagen/m3');
  await page.getByRole('button', { name: 'Open the cheat sheet' }).click();
  await expect(page).toHaveURL(/#\/sheet\/elektrotechnik-grundlagen\/m3$/);
  await expect(page.getByRole('heading', { name: 'Cheat sheet', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Das Ohmsche Gesetz' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Formulas' }).getByText('U = R · I')).toBeVisible();
  await expect(page.getByText('Watch out:').first()).toBeVisible();
  // One unit: no other unit's lessons.
  await expect(page.getByRole('heading', { name: 'Reihenschaltung' })).toHaveCount(0);

  await page.getByRole('combobox').selectOption('');
  await expect(page).toHaveURL(/#\/sheet\/elektrotechnik-grundlagen$/);
  await expect(page.getByRole('heading', { name: 'Reihenschaltung' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Terms' })).toBeVisible();

  // Printing hides the app around the sheet.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.cf-header')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Reihenschaltung' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a cheat sheet for a course that is not there says so', async ({ page }) => {
  await page.goto('./#/sheet/nope');
  await expect(page.getByRole('button', { name: /back/i })).toBeVisible();
});
