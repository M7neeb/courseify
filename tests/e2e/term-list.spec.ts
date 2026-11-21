import { test, expect } from '@playwright/test';

const LIST = ['RAM - Arbeitsspeicher', 'ROM - Nur-Lese-Speicher', 'CPU - Prozessor', 'GPU - Grafikprozessor', 'SSD - Flash-Speicher', 'Nur eine Überschrift', 'ram - doppelt'].join('\n');

test('a pasted list of terms becomes a course with cards and questions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./#/import');
  await page.getByLabel('Or paste it here').fill(LIST);
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(page.getByRole('heading', { name: 'A list of 5 terms' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Arbeitsspeicher' })).toBeVisible();
  await expect(page.getByText('Nur eine Überschrift')).toBeVisible();
  await expect(page.getByText('Listed twice, kept once: ram')).toBeVisible();
  // No JSON errors for a list.
  await expect(page.getByRole('alert')).toHaveCount(0);

  const make = page.getByRole('button', { name: 'Make the course' });
  await expect(make).toBeDisabled();
  await page.getByLabel('Course name').fill('Hardware-Begriffe');
  await page.getByLabel('Language of the questions').selectOption('de');
  await make.click();
  await expect(page.getByRole('main').getByText('Made “Hardware-Begriffe” from 5 terms.')).toBeVisible();

  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(/#\/course\/list-hardware-begriffe/);
  await expect(page.getByRole('heading', { name: 'Begriffe 1 bis 5' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Grafikprozessor' })).toBeVisible();

  // The first question asks for the meaning of RAM; pick the right one.
  await expect(page.getByText('Was bedeutet RAM?').first()).toBeVisible();
  // The warm-up asks the lesson's own questions first; answer it.
  await page.getByRole('radio', { name: 'Arbeitsspeicher' }).first().check();
  await page.getByRole('button', { name: 'Check' }).first().click();
  await expect(page.getByText(/correct|richtig/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('broken JSON still lists its errors and is not offered as a term list', async ({ page }) => {
  await page.goto('./#/import');
  await page.getByLabel('Or paste it here').fill('{\n  "schemaVersion": 2,\n  "id": "x",\n  "title": "Broken",\n  "modules": [\n');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make the course' })).toHaveCount(0);
});

test('the flashcard deck saves as a text file Anki and Quizlet can read', async ({ page }) => {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(new URL('../../examples/sample-course.json', import.meta.url).pathname);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.goto('./#/cards/networking-basics');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export for Anki or Quizlet' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('networking-basics-cards.txt');
  const { readFile } = await import('node:fs/promises');
  const text = await readFile((await file.path())!, 'utf8');
  const lines = text.trimEnd().split('\n');
  expect(lines[0]).toBe('#separator:tab');
  expect(lines.slice(3).every((line) => line.split('\t').length === 3)).toBe(true);
  expect(text).toContain('What does a MAC address identify?\t');
});
