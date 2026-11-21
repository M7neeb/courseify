import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const sampleCourse = fileURLToPath(new URL('../../examples/sample-course.json', import.meta.url));

test('the app starts on the home screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'My courses' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No courses yet' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('importing a course file and opening it shows the first lesson', async ({ page }) => {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(sampleCourse);

  await expect(page.getByText(/\d+ modules?, \d+ parts/)).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported “Networking basics”.')).toBeVisible();

  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(/#\/course\/networking-basics/);
  await expect(page.getByRole('heading', { name: 'What is a network?' })).toBeVisible();
});

test('pasting broken JSON lists the errors instead of importing', async ({ page }) => {
  await page.goto('./#/import');
  await page.getByLabel('Or paste it here').fill('{ "schemaVersion": 2, "id": "x" }');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('heading', { name: 'This cannot be imported yet' })).toBeVisible();
});

test('a course opens from Explore on its unit page with the mastery squares', async ({ page, isMobile }) => {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(sampleCourse);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.goto('./#/home');

  const group = page.locator('.cf-course-group', { hasText: 'Networking basics' });
  await expect(group.getByRole('button', { name: 'How computers talk' })).toBeVisible();

  if (isMobile) {
    await group.getByRole('button', { name: 'Start' }).click();
  } else {
    await page.locator('.cf-explore > summary').click();
    await page.getByRole('region', { name: 'Courses by subject' }).getByRole('button', { name: 'Networking basics' }).click();
  }

  await expect(page).toHaveURL(/#\/unit\/networking-basics\/m1/);
  await expect(page.getByRole('heading', { name: 'Unit 1: How computers talk' })).toBeVisible();
  await expect(page.getByText('Unit mastery: 0%')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Mastery levels' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Unit test' })).toBeVisible();
});

test('a lesson video is ready to play, with no search term or link box', async ({ page }) => {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(sampleCourse);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.goto('./#/course/networking-basics/m1-l1');

  const player = page.locator('.block.video iframe');
  await expect(player).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/UjOXLg7HauQ/);
  await expect(page.getByText('Paste the YouTube link')).toHaveCount(0);
  await expect(page.getByText('Suggested search')).toHaveCount(0);
});
