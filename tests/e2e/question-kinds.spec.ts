import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The written answer (write, compare, tick key points) and the hotspot question (tap the picture).

const course = fileURLToPath(new URL('../fixtures/new-kinds-course.json', import.meta.url));

async function importCourse(page: Page) {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(course);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported “New question kinds”.')).toBeVisible();
}

test('a written answer is compared with the model answer and graded by key points', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await importCourse(page);
  await page.goto('./#/course/new-kinds/m1-l1');

  await page.getByPlaceholder(/Write your answer in your own words/).fill('The current is the same in every part of the circuit.');
  await page.getByRole('button', { name: 'Compare with a model answer' }).click();
  await expect(page.getByText('Model answer', { exact: true })).toBeVisible();
  // The first key point is ticked from the words used; the others are not.
  const points = page.locator('.written-point input');
  await expect(points.nth(0)).toBeChecked();
  await expect(points.nth(2)).not.toBeChecked();

  await page.getByRole('button', { name: 'Grade my answer' }).click();
  await expect(page.getByText('1 key points covered, 2 needed.', { exact: false })).toBeVisible();

  await page.getByPlaceholder(/Write your answer in your own words/).fill('The current is the same in every part, because there is only one path.');
  await points.nth(1).check();
  await page.getByRole('button', { name: 'Grade my answer' }).click();
  await expect(page.locator('.question[data-state="right"]')).toBeVisible();
  await expect(page.getByText('2 of 3 key points')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a hotspot question is answered by tapping the picture', async ({ page }) => {
  await importCourse(page);
  await page.goto('./#/course/new-kinds/m1-l1');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();

  const pic = page.locator('.hotspot-pic');
  await expect(pic).toBeVisible();
  const box = (await pic.boundingBox())!;
  // A wrong tap first: the lamp on the right.
  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.locator('.question[data-state="wrong"]')).toBeVisible();
  // Then the resistor at the top.
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2);
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.locator('.question[data-state="right"]')).toBeVisible();
  await expect(page.locator('.hotspot-area.right')).toBeVisible();
  await expect(page.getByText('The right place: the resistor at the top.')).toBeVisible();
});

test('formulas, diagrams and glossary terms show in lesson text', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await importCourse(page);
  await page.goto('./#/settings/new-kinds');
  await page.getByLabel(/^Lesson gating/).selectOption('free');
  await page.goto('./#/course/new-kinds/m1-l2');
  const text = page.locator('.block.text .prose');
  // Two formulas are drawn; the prices stay text.
  await expect(text.locator('.katex')).toHaveCount(2);
  await expect(text).toContainText('costs $5 and $10 to learn');
  // The diagram is drawn as a picture.
  await expect(page.locator('.cf-diagram svg')).toBeVisible({ timeout: 15_000 });
  // Glossary terms are underlined once and explain themselves when tapped.
  await expect(text.locator('.cf-term')).toHaveCount(2);
  await text.locator('.cf-term', { hasText: 'resistor' }).click();
  const pop = page.getByRole('dialog', { name: 'resistor' });
  await expect(pop).toContainText('A part that limits the current');
  await expect(pop.locator('.katex')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a reported question is fixed with one prompt and an import', async ({ page }) => {
  await importCourse(page);
  await page.goto('./#/settings/new-kinds');
  await page.getByLabel(/^Lesson gating/).selectOption('free');
  await page.goto('./#/course/new-kinds/m1-l2');
  await page.getByRole('button', { name: 'Report a problem with this question' }).click();
  await page.getByLabel('Unclear, or more than one answer fits').check();
  await page.getByLabel(/Note \(optional\)/).fill('Say which kind of circuit.');
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.getByText('Reported.', { exact: false })).toBeVisible();

  await page.goto('./#/settings/new-kinds');
  await expect(page.getByText('Reported questions (1)')).toBeVisible();
  await expect(page.getByText('Say which kind of circuit.', { exact: false })).toBeVisible();

  // The AI's answer: the same question, corrected.
  const fixed = { courseId: 'new-kinds', questions: [{ id: 'q-r1', kind: 'true-false', prompt: 'In a series circuit (one path) the current is the same everywhere.', answer: true, explanation: 'One path.' }] };
  await page.goto('./#/import');
  await page.locator('#import-text').fill(JSON.stringify(fixed));
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByText('1 corrected question(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('1 question(s) in "New question kinds" are fixed.')).toBeVisible();

  await page.goto('./#/settings/new-kinds');
  await expect(page.getByText('Reported questions (0)')).toBeVisible();
  await page.goto('./#/course/new-kinds/m1-l2');
  await expect(page.getByText('In a series circuit (one path)')).toBeVisible();
});

test('a course can be shared as a file from the library', async ({ page }) => {
  await importCourse(page);
  await page.goto('./#/library');
  await page.locator('.course-more').first().locator('summary').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share course' }).first().click();
  expect((await download).suggestedFilename()).toBe('new-kinds.json');
});

test('code runs in the lesson, and code questions are checked by their tests', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await importCourse(page);
  await page.goto('./#/settings/new-kinds');
  await page.getByLabel(/^Lesson gating/).selectOption('free');
  await page.goto('./#/course/new-kinds/m1-l3');

  // The runnable example.
  const example = page.locator('.block.code-block');
  await example.getByRole('button', { name: 'Run' }).click();
  await expect(example.locator('.code-out')).toHaveText('Hello Ada');

  // JavaScript: a wrong answer fails a test, a right one passes them all.
  const editor = page.getByLabel('Your code');
  await editor.fill('function add(a, b) {\n  return a * b - 1;\n}\n');
  await page.getByRole('button', { name: 'Check with the tests' }).click();
  await expect(page.getByText('1 of 2 tests passed')).toBeVisible();
  await expect(page.getByText('got -2, expected 0')).toBeVisible();
  await editor.fill('function add(a, b) {\n  return a + b;\n}\n');
  await page.getByRole('button', { name: 'Check with the tests' }).click();
  await expect(page.getByText('2 of 2 tests passed')).toBeVisible();
  await expect(page.locator('.question[data-state="right"]')).toBeVisible();
  await page.getByRole('button', { name: 'Next question' }).first().click();

  // Python, reading input: loads Python the first time.
  await page.getByLabel('Your code').fill("name = input()\nprint('Hi', name)\n");
  await page.getByRole('button', { name: 'Check with the tests' }).click();
  await expect(page.getByText('2 of 2 tests passed')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.question[data-state="right"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('an endless loop is stopped', async ({ page }) => {
  await importCourse(page);
  await page.goto('./#/settings/new-kinds');
  await page.getByLabel(/^Lesson gating/).selectOption('free');
  await page.goto('./#/course/new-kinds/m1-l3');
  const example = page.locator('.block.code-block');
  await example.getByLabel('Hello').fill('while (true) {}');
  await example.getByRole('button', { name: 'Run' }).click();
  await expect(example.getByText('The code ran for too long and was stopped.')).toBeVisible({ timeout: 15_000 });
});
