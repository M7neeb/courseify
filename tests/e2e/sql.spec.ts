import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The SQL exercises run in a worker with sql.js: run a query, see the table, check it against the model answer.

const course = readFileSync(fileURLToPath(new URL('../../courses/sql-detektiv.json', import.meta.url)));

async function open(page: Page) {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles({ name: 'sql-detektiv.json', mimeType: 'application/json', buffer: course });
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported', { exact: false })).toBeVisible();
  await page.goto('./#/settings/sql-detektiv');
  await page.getByLabel(/^Lesson gating/).selectOption('free');
  await page.goto('./#/course/sql-detektiv/m1-l1');
}

test('SQL: the practice tables show, a query runs, a wrong table is explained, the right one passes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await open(page);
  const quiz = page.locator('.block.quiz').last();
  await expect(quiz.getByText('The practice database')).toBeVisible();
  await expect(quiz.locator('.sql-schema').getByText('suspects')).toBeVisible();

  const editor = quiz.getByLabel('SQL query');
  await editor.fill('SELECT name FROM suspects;');
  await quiz.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(quiz.getByText('Result: 8 rows')).toBeVisible();
  await expect(quiz.locator('.sql-table')).toContainText('Anna Berg');

  await quiz.getByRole('button', { name: 'Check my query' }).click();
  await expect(quiz.getByText('Your table has 1 columns, but the answer has 5.')).toBeVisible();

  await editor.fill('SELECT * FROM suspects;');
  await quiz.getByRole('button', { name: 'Check my query' }).click();
  await expect(quiz.getByRole('button', { name: /Next question|See results/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('SQL: a syntax error is shown, not crashed', async ({ page }) => {
  await open(page);
  const quiz = page.locator('.block.quiz').last();
  await quiz.getByLabel('SQL query').fill('SELEKT * FROM suspects;');
  await quiz.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(quiz.locator('.code-error').first()).toContainText('syntax error');
});
