import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The Linux course's practice terminal: wrong commands print an error, the right one solves the task.

const course = readFileSync(fileURLToPath(new URL('../../courses/linux-kommandozeile.json', import.meta.url)));

test('shell question: an unknown command is explained, the right command solves the task', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles({ name: 'linux.json', mimeType: 'application/json', buffer: course });
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported', { exact: false })).toBeVisible();
  await page.goto('./#/settings/linux-kommandozeile');
  await page.getByLabel(/^Lesson gating/).selectOption('free');
  await page.goto('./#/course/linux-kommandozeile/m1-l1');

  const quiz = page.locator('.block.quiz').last();
  const cmd = quiz.getByLabel('Command');
  await cmd.fill('hello');
  await cmd.press('Enter');
  await expect(quiz.getByText('hello: command not found')).toBeVisible();
  await cmd.fill('pwd');
  await cmd.press('Enter');
  await expect(quiz.getByText('/home/anna', { exact: true })).toBeVisible();
  await expect(quiz.getByText('Done. The task is solved.')).toBeVisible();
  await expect(quiz.getByRole('button', { name: /Next question|See results/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
