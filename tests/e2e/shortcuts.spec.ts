import { test, expect } from '@playwright/test';

test('? opens the keyboard shortcuts, Escape closes them, and typing a ? in a field does not', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await page.goto('./#/home');
  await expect(page.getByRole('heading', { name: 'My courses' })).toBeVisible();
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Pick an answer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.goto('./#/import');
  await page.locator('#import-text').fill('');
  await page.locator('#import-text').press('?');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#import-text')).toHaveValue('?');

  // Settings has a way in for people who would not guess the key.
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
});
