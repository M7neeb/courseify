import { test, expect, type Page } from '@playwright/test';

// The app's own learning aids: a guess-first warm-up made from the lesson's questions, a "Why?" step
// after a right concept answer, and a worked example that fades with the skill level.

const questions = [1, 2, 3, 4, 5].map((n) => ({
  id: `q${n}`,
  kind: 'multiple-choice',
  prompt: `Question number ${n}?`,
  options: [`Right ${n}`, `Wrong ${n}`],
  answer: 0,
  explanation: `Because ${n} is how it works.`
}));

const course = {
  schemaVersion: 2,
  id: 'aids',
  title: 'Learning aids',
  modules: [
    {
      id: 'm1',
      title: 'Unit',
      lessons: [
        {
          id: 'l1',
          title: 'Lesson one',
          blocks: [
            { id: 'ex', type: 'example', markdown: 'Solve it.\n\n1. First step.\n2. Second step.\n3. Third step.\n4. Fourth step.\n\nDone.' },
            { id: 'quiz', type: 'quiz', questions }
          ]
        }
      ]
    }
  ]
};

async function importCourse(page: Page) {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles({ name: 'aids.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(course)) });
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported', { exact: false })).toBeVisible();
  await page.goto('./#/settings/aids');
  await page.getByLabel(/^Lesson gating/).selectOption('free');
}

test('a lesson gets a guess-first warm-up, and a right answer asks "Why?" before the explanation', async ({ page }) => {
  await importCourse(page);
  await page.goto('./#/course/aids/l1');
  const warmup = page.locator('.block.quiz').first();
  await expect(warmup.getByText('Warm-up')).toBeVisible();
  await expect(warmup.getByText('Question 1 of 3')).toBeVisible();
  await warmup.getByRole('radio', { name: 'Wrong 1' }).check();
  await warmup.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(warmup.getByText('Because 1 is how it works.')).toBeVisible();

  const quiz = page.locator('.block.quiz').last();
  await quiz.getByRole('radio', { name: 'Right 1' }).check();
  await quiz.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(quiz.getByText('Why is that right?', { exact: false })).toBeVisible();
  await expect(quiz.getByText('Because 1 is how it works.')).toHaveCount(0);
  await quiz.getByLabel(/Why is that right/).fill('it just is');
  await quiz.getByRole('button', { name: 'Show the explanation' }).click();
  await expect(quiz.getByText('You wrote: it just is')).toBeVisible();
  await expect(quiz.getByText('Because 1 is how it works.')).toBeVisible();
});

test('the worked example shows every step at first, then hides the last ones as the skill grows', async ({ page }) => {
  await importCourse(page);
  await page.goto('./#/course/aids/l1');
  const example = page.locator('.block.example');
  await expect(example.getByText('Fourth step.')).toBeVisible();
  await expect(example.locator('.example-fade')).toHaveCount(0);

  // Answer every question right: the skill becomes Attempted or better, so the last step fades.
  const quiz = page.locator('.block.quiz').last();
  for (let n = 1; n <= 5; n++) {
    await quiz.getByRole('radio', { name: `Right ${n}` }).check();
    await quiz.getByRole('button', { name: 'Check', exact: true }).click();
    if (await quiz.getByRole('button', { name: 'Show the explanation' }).isVisible()) await quiz.getByRole('button', { name: 'Show the explanation' }).click();
    await quiz.getByRole('button', { name: /Next question|See results/ }).first().click();
  }
  await page.goto('./#/course/aids/l1');
  await expect(example.locator('.example-fade').first()).toBeVisible();
  await expect(example.getByText('First step.')).toBeVisible();
  const faded = await example.locator('.example-fade').count();
  expect(faded).toBeGreaterThanOrEqual(1);
  await example.locator('.example-fade').last().click();
  await expect(example.locator('.example-fade')).toHaveCount(faded - 1);
});

test('a picture card: uncover parts by tapping, and test yourself on them', async ({ page }) => {
  const picture = {
    ...course,
    id: 'pic',
    title: 'Picture card',
    modules: [
      {
        id: 'm1',
        title: 'Unit',
        lessons: [
          {
            id: 'l1',
            title: 'Parts',
            blocks: [
              {
                id: 'occ',
                type: 'occlusion',
                svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="#eee"/><circle cx="25" cy="25" r="10" fill="#c33"/><rect x="60" y="15" width="20" height="20" fill="#36c"/></svg>',
                alt: 'Two shapes',
                areas: [
                  { x: 15, y: 30, w: 20, h: 40, label: 'The red circle' },
                  { x: 60, y: 30, w: 20, h: 40, label: 'The blue square' }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles({ name: 'pic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(picture)) });
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported', { exact: false })).toBeVisible();
  await page.goto('./#/settings/pic');
  await page.getByLabel(/^Lesson gating/).selectOption('free');
  await page.goto('./#/course/pic/l1');

  const card = page.locator('.block.occlusion');
  await expect(card.locator('.occlusion-mask')).toHaveCount(2);
  await card.getByRole('button', { name: 'Covered part 1' }).click();
  await expect(card.getByText('1 of 2 uncovered.', { exact: false })).toBeVisible();
  await expect(card.getByText('The red circle')).toBeVisible();

  await card.getByRole('button', { name: 'Test me' }).click();
  await expect(card.locator('.occlusion-mask.target')).toHaveCount(1);
  await card.getByRole('button', { name: 'Show the answer' }).click();
  await card.getByRole('button', { name: 'I knew it' }).click();
  await card.getByRole('button', { name: 'Show the answer' }).click();
  await card.getByRole('button', { name: 'Not yet' }).click();
  await expect(card.getByText('You knew 1 of 2 parts.')).toBeVisible();
});
