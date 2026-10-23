import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const sampleCourse = fileURLToPath(new URL('../../examples/sample-course.json', import.meta.url));

test('the course builder turns the six steps into an outline prompt', async ({ page, context, browserName }) => {
  await page.goto('./#/prompt');
  await expect(page.getByRole('heading', { name: 'Create a course' })).toBeVisible();
  await expect(page.getByText('Enter a topic in step 1 first.')).toBeVisible();

  await page.getByRole('button', { name: /Learn programming/ }).click();
  await page.locator('#create-topic').fill('Python basics');
  await page.locator('#create-subject').fill('IT');

  // Walk every step once with Next.
  for (const step of ['Material', 'Languages', 'Structure', 'Practice', 'Extras']) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(step) }).first()).toHaveAttribute('aria-current', 'step');
  }

  await page.getByText('Show the prompt').click();
  const prompt = page.locator('.cf-prompt-preview pre');
  await expect(prompt).toContainText('"id": "python-basics"');
  await expect(prompt).toContainText('Step 1: plan the course');

  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy prompt' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('"id": "python-basics"');
  }
});

test('continue a course lists a prompt for every unit and the final exam', async ({ page }) => {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(sampleCourse);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported “Networking basics”.')).toBeVisible();

  await page.goto('./#/prompt');
  await page.getByRole('button', { name: 'Continue a course' }).click();
  const units = page.locator('.cf-unit-prompts li');
  await expect(units.first()).toContainText('Unit 1: How computers talk');
  await expect(units.first()).toContainText('Written');
  await expect(page.locator('.cf-unit-prompts')).toContainText('Final exam');
});
