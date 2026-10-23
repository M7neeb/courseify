import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Generated practice (drills) and the graph block and plotter.

const course = fileURLToPath(new URL('../fixtures/new-kinds-course.json', import.meta.url));

/** The answer to a "hosts in a /n network" problem shown on the page. */
async function hostsAnswer(page: Page): Promise<string> {
  const text = (await page.locator('.drill-prompt').innerText()).match(/\/(\d+)/)!;
  return String(2 ** (32 - Number(text[1])) - 2);
}

test('a drill in a lesson: wrong, a step, right, then the set result', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(course);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText('Imported “New question kinds”.')).toBeVisible();
  await page.goto('./#/settings/new-kinds');
  await page.getByLabel(/^Lesson gating/).selectOption('free');
  await page.goto('./#/course/new-kinds/m1-l4');

  const drill = page.locator('.drill-block');
  await expect(drill.getByText('Hosts in a subnet')).toBeVisible();
  await expect(drill.getByText('Problem 1 of 2')).toBeVisible();
  const answer = drill.getByLabel('Your answer');
  await answer.fill('1');
  await drill.getByRole('button', { name: 'Check' }).click();
  await expect(drill.getByText('Not quite.', { exact: false })).toBeVisible();
  await drill.getByRole('button', { name: 'Show the first step' }).click();
  await expect(drill.locator('.drill-steps li')).toHaveCount(1);
  await expect(drill.locator('.drill-steps .katex')).toHaveCount(1);
  await answer.fill(await hostsAnswer(page));
  await answer.press('Enter');
  await expect(drill.getByText('Right. Next time without help.')).toBeVisible();
  await drill.getByRole('button', { name: 'Next problem' }).click();

  await expect(drill.getByText('Problem 2 of 2')).toBeVisible();
  await answer.fill(await hostsAnswer(page));
  await answer.press('Enter');
  await expect(drill.getByText('Right!')).toBeVisible();
  await drill.getByRole('button', { name: 'See the result' }).click();
  await expect(drill.getByText('1 of 2 right on the first try.')).toBeVisible();

  // The graph: sliders change the curve; dragging reads off a value.
  const graph = page.locator('.graph-block');
  const curve = graph.locator('path.graph-curve');
  const before = await curve.getAttribute('d');
  await graph.getByRole('slider', { name: /b = 0/ }).fill('3');
  await expect(graph.getByText('b = 3')).toBeVisible();
  expect(await curve.getAttribute('d')).not.toBe(before);
  const svg = graph.locator('svg.graph-svg');
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await expect(graph.locator('.graph-readout strong')).toHaveText('f(2) = 7');
  await svg.focus();
  await page.keyboard.press('ArrowRight');
  await expect(graph.locator('.graph-readout strong')).toHaveText('f(2.1) = 7.41');
  expect(errors).toEqual([]);
});

test('the Drills page keeps a run and the best run, per level', async ({ page }) => {
  await page.goto('./#/drills');
  await page.getByRole('link', { name: /Hosts in a subnet/ }).click();
  await expect(page.getByRole('heading', { name: 'Hosts in a subnet' })).toBeVisible();
  await page.getByRole('button', { name: 'Hard' }).click();
  await expect(page.getByRole('button', { name: 'Hard' })).toHaveAttribute('aria-pressed', 'true');
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('Your answer').fill(await hostsAnswer(page));
    await page.getByLabel('Your answer').press('Enter');
    await expect(page.getByText('Right!')).toBeVisible();
    await page.getByRole('button', { name: 'Next problem' }).click();
  }
  await expect(page.getByText('Run: 3', { exact: true })).toBeVisible();
  await expect(page.getByText('Best run: 3')).toBeVisible();
  await page.getByRole('button', { name: 'Show the solution' }).click();
  await expect(page.getByText('The answer is', { exact: false })).toBeVisible();
  await expect(page.getByText('Run: 0', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Best run: 3')).toBeVisible();
  await expect(page.getByText('3 solved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hard' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('./#/drills');
  await expect(page.getByRole('link', { name: /Hosts in a subnet/ })).toContainText('3 solved');
});

test('the graph plotter draws typed functions with sliders', async ({ page }) => {
  await page.goto('./#/drills/graph');
  await expect(page.locator('path.graph-curve')).toHaveCount(2);
  await expect(page.getByRole('slider', { name: /a = 1/ })).toBeVisible();
  await page.getByLabel('g(x) =').fill('2x +');
  await expect(page.getByText("This can't be read yet", { exact: false })).toBeVisible();
  await expect(page.locator('path.graph-curve')).toHaveCount(1);
  await page.getByLabel('g(x) =').fill('kx - 1');
  await expect(page.locator('path.graph-curve')).toHaveCount(2);
  await expect(page.getByRole('slider', { name: /k = 1/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/graph-plotter.png' });
});
