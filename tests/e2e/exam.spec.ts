import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The mock exam: questions against a clock, no feedback until the end, then a grade.

const sampleCourse = fileURLToPath(new URL('../../examples/sample-course.json', import.meta.url));

test('a mock exam saves answers without feedback and grades at the end', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(sampleCourse);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported “Networking basics”.')).toBeVisible();

  await page.goto('./#/unit/networking-basics/m1');
  await page.getByRole('button', { name: 'Take a mock exam' }).click();
  await expect(page.getByRole('heading', { name: 'Mock exam' })).toBeVisible();
  await page.getByRole('button', { name: 'Start the exam' }).click();

  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get a hint' })).toHaveCount(0);
  const progress = page.locator('.quiz-progress');
  await expect(progress).toContainText('Question 1 of');

  // Answer the first question with anything: no right or wrong is shown, the next one appears.
  const option = page.locator('.options .option').first();
  if (await option.isVisible()) {
    await option.click();
  } else {
    const input = page.locator('.question input[type="text"], .question textarea').first();
    if (await input.isVisible()) await input.fill('42');
  }
  const check = page.getByRole('button', { name: /^(Check|Save answer)$/ });
  if (await check.isEnabled()) await check.click();
  else await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(progress).toContainText('Question 2 of');
  await expect(page.locator('.question[data-state="wrong"], .question[data-state="right"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Hand in' }).click();
  await expect(page.locator('.exam-grade')).toHaveText(/^Grade [1-6]$/);
  await expect(page.getByText(/question\(s\) not answered/)).toBeVisible();
  expect(errors).toEqual([]);
});
