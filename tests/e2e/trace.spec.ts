import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The trace table question of the programming course: fill the empty cells, wrong ones are marked.

const course = readFileSync(fileURLToPath(new URL('../../courses/programmieren-grundlagen.json', import.meta.url)));

test('a trace table question: a wrong cell is marked, the right values pass', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles({ name: 'prog.json', mimeType: 'application/json', buffer: course });
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported', { exact: false })).toBeVisible();
  await page.goto('./#/settings/programmieren-grundlagen');
  await page.getByLabel(/^Lesson gating/).selectOption('free');
  await page.goto('./#/course/programmieren-grundlagen/m1-l1');

  const quiz = page.locator('.block.quiz').last();
  const cells = quiz.locator('.trace-table input');
  await expect(cells).toHaveCount(3);
  await expect(quiz.getByRole('button', { name: 'Check', exact: true })).toBeDisabled();
  await cells.nth(0).fill('5');
  await cells.nth(1).fill('3');
  await cells.nth(2).fill('5');
  await quiz.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(quiz.getByText('Not quite', { exact: false }).first()).toBeVisible();
  await cells.nth(0).fill('5');
  await cells.nth(1).fill('3');
  await cells.nth(2).fill('5');
  await cells.nth(1).fill('3');
  // 3rd line: a = 3 * 5 = 15, b stays 5; the blanks are (line 2, b), (line 3, a), (line 3, b).
  await cells.nth(0).fill('5');
  await cells.nth(1).fill('15');
  await cells.nth(2).fill('5');
  await quiz.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(quiz.getByText('Correct', { exact: false }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
