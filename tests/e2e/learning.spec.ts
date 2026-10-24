import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The learning engine: "How sure are you?", spaced reviews coming due on later days, the Today
// card on Home, the course challenge and warm-up (guess-first) questions.

const sampleCourse = fileURLToPath(new URL('../../examples/sample-course.json', import.meta.url));
const DAY = 24 * 60 * 60 * 1000;

async function importSample(page: Page) {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(sampleCourse);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported “Networking basics”.')).toBeVisible();
}

/** Answers the practice set: the MAC question wrong-but-sure once, everything else right. */
async function practiseWithConfidentMiss(page: Page) {
  let missed = false;
  for (let step = 0; step < 20; step += 1) {
    if (await page.getByRole('region', { name: 'Results' }).isVisible()) return;
    if (await page.locator('.question[data-state="right"]').isVisible()) {
      await page.getByRole('button', { name: /Next question|See results/ }).click();
      continue;
    }
    const prompt = (await page.locator('.question-prompt').first().innerText()).trim();
    const mac = prompt.includes('Netzwerkkarte');
    if (mac && !missed) {
      await page.getByRole('radio', { name: 'Sure', exact: true }).click();
      await page.getByRole('radio', { name: 'IP-Adresse', exact: true }).click();
      await page.getByRole('button', { name: 'Check', exact: true }).click();
      await expect(page.getByText('You were sure about this one.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Stuck? Ask an AI tutor' })).toBeVisible();
      missed = true;
    }
    await page.getByRole('radio', { name: mac ? 'MAC-Adresse' : 'True', exact: true }).click();
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await page.getByRole('button', { name: /Next question|See results/ }).click();
  }
  throw new Error('The quiz never reached its results.');
}

test('confident mistakes are flagged and come back for review on a later day', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await importSample(page);

  await page.goto('./#/exercise/networking-basics/m1-l1');
  await expect(page.getByRole('radiogroup', { name: 'How sure are you?' })).toBeVisible();
  await practiseWithConfidentMiss(page);

  // Nothing is due today: everything was just answered.
  await page.goto('./#/review');
  await expect(page.getByRole('heading', { name: "Today's review" })).toBeVisible();
  await expect(page.getByText('Nothing to review right now.')).toBeVisible();

  // Three days later the questions are due, and Home says so.
  await page.clock.setFixedTime(new Date(Date.now() + 3 * DAY));
  await page.goto('./#/home');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: 'Review now' }).click();
  await expect(page).toHaveURL(/#\/review/);
  await expect(page.getByText(/questions? (is|are) due for review/)).toBeVisible();
  await page.getByRole('button', { name: 'Start review' }).click();
  await expect(page.locator('.question-prompt').first()).toBeVisible();
  // A due question starts unanswered, not on the answer it had in the lesson.
  await expect(page.locator('.question').first()).toHaveAttribute('data-state', 'open');
  expect(errors).toEqual([]);
});

test('the course challenge mixes the whole course', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await importSample(page);
  await page.goto('./#/unit/networking-basics/m1');
  await page.getByRole('button', { name: 'Start course challenge' }).click();
  await expect(page).toHaveURL(/#\/challenge\/networking-basics/);
  await expect(page.getByRole('heading', { name: 'Course challenge', level: 1 })).toBeVisible();
  await expect(page.getByText(/questions from the whole course, mixed together/)).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText(/^Question 1 of \d+/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('warm-up questions are guesses that never count as mistakes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const course = {
    schemaVersion: 2,
    id: 'warmup-demo',
    title: 'Warm-up demo',
    language: 'en',
    modules: [
      {
        id: 'm1',
        title: 'Unit',
        lessons: [
          {
            id: 'm1-l1',
            title: 'Guess first',
            blocks: [
              {
                id: 'm1-l1-b0',
                type: 'quiz',
                pretest: true,
                questions: [{ id: 'q-w-1', kind: 'true-false', prompt: 'Is the sky green?', answer: false, explanation: 'It is blue.' }]
              },
              { id: 'm1-l1-b1', type: 'text', levels: { normal: 'The sky is blue.' } },
              { id: 'm1-l1-b2', type: 'quiz', questions: [{ id: 'q-1', kind: 'true-false', prompt: 'Is the sky blue?', answer: true }] }
            ]
          }
        ]
      }
    ]
  };
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles({ name: 'warmup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(course)) });
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported “Warm-up demo”.')).toBeVisible();

  await page.goto('./#/course/warmup-demo/m1-l1');
  await expect(page.getByText('Warm-up', { exact: true })).toBeVisible();
  const warmup = page.locator('section.quiz').first();
  await warmup.getByRole('radio', { name: 'True', exact: true }).click();
  await warmup.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(warmup.getByText('Good guess - here is the answer')).toBeVisible();
  await warmup.getByRole('button', { name: 'See results' }).click();
  await expect(warmup.getByText('Warm-up done.')).toBeVisible();

  // The wrong guess is not a mistake.
  await page.goto('./#/review');
  await expect(page.getByText('No mistakes to review.')).toBeVisible();
  expect(errors).toEqual([]);
});
