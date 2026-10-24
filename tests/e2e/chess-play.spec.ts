import { test, expect, type Page } from '@playwright/test';

// Playing the bots like on chess.com: drawing on the board, clocks, a custom bot, board settings,
// aborting, and a rated game.

async function startGame(page: Page, opts: { bot?: string; time?: string; rated?: boolean } = {}) {
  await page.goto('./#/play');
  await page.getByRole('button', { name: opts.bot ?? 'Pip 250' }).click();
  if (opts.time) await page.getByRole('button', { name: opts.time }).click();
  if (opts.rated) await page.getByLabel('Hints and take-backs').uncheck();
  await page.locator('.cf-bot-play').click();
  await expect(page.locator('.cf-board')).toBeVisible();
}

/** Holds the right button down on one square and lets go on another. */
async function rightDrag(page: Page, from: string, to: string) {
  await page.locator('.cf-board').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const a = (await page.locator(`[data-square="${from}"]`).boundingBox())!;
  const b = (await page.locator(`[data-square="${to}"]`).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await page.mouse.up({ button: 'right' });
}

test('right-click draws arrows and coloured squares; a left click clears them', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'a mouse right-click is a desktop thing; touch uses press and hold');
  await startGame(page);
  await expect(page.locator('.cf-chat-bubble')).toBeVisible();
  const e2 = page.locator('[data-square="e2"]');
  const e4 = page.locator('[data-square="e4"]');

  await e4.click({ button: 'right' });
  await expect(e4).toHaveAttribute('data-user', 'plan');
  // A knight jump bends like an L.
  await rightDrag(page, 'b1', 'c3');
  const arrow = page.locator('.cf-arrows path.user');
  await expect(arrow).toHaveCount(1);
  expect((await arrow.getAttribute('d'))!.split('L').length).toBe(3);
  // Shift draws green; drawing the same arrow again removes it.
  await page.keyboard.down('Shift');
  await rightDrag(page, 'g1', 'f3');
  await page.keyboard.up('Shift');
  await expect(page.locator('.cf-arrows path.user.good')).toHaveCount(1);
  await rightDrag(page, 'b1', 'c3');
  await expect(page.locator('.cf-arrows path.user')).toHaveCount(1);

  await page.locator('[data-square="a5"]').click();
  await expect(page.locator('.cf-arrows path.user')).toHaveCount(0);
  await expect(e4).not.toHaveAttribute('data-user', /.*/);
  // Drawing never gets in the way of a move.
  await e2.click();
  await e4.click();
  await expect(page.locator('.cf-score-sheet li').first()).toHaveText(/1\.\s*e4/);
});

test('a game on the clock: both clocks show, and yours runs once both sides have moved', async ({ page }) => {
  test.setTimeout(90_000);
  await startGame(page, { time: '3 min Blitz' });
  await expect(page.getByText('3 min', { exact: true })).toBeVisible();
  const clocks = page.locator('.cf-clock');
  await expect(clocks).toHaveCount(2);
  await expect(clocks.first()).toHaveText('3:00');
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('.cf-score-sheet li').first()).toHaveText(/1\.\s*e4\s*\S+/, { timeout: 30_000 });
  // Now it is White's turn with both first moves made: White's clock counts down.
  const mine = page.locator('.cf-clock[data-color="w"]');
  await expect(mine).toHaveClass(/active/);
  await expect(mine).not.toHaveText('3:00', { timeout: 5_000 });
});

test('a premove plays itself as soon as the bot has moved', async ({ page }) => {
  test.setTimeout(90_000);
  await startGame(page, { time: '10 min Rapid' });
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  // While the bot thinks: queue d2-d4.
  await page.locator('[data-square="d2"]').click();
  await page.locator('[data-square="d4"]').click();
  await expect(page.locator('.cf-score-sheet li').nth(1)).toHaveText(/2\.\s*d4/, { timeout: 30_000 });
});

test('a custom bot at any strength', async ({ page }) => {
  await page.goto('./#/play');
  await page.getByRole('button', { name: /Custom bot/ }).click();
  await page.locator('.cf-custom-elo input').fill('1450');
  await expect(page.getByText('Strength: 1450')).toBeVisible();
  await page.locator('.cf-bot-play').click();
  await expect(page.getByText('Bot 1450 (1450)')).toBeVisible();
  await expect(page.getByText('A bot at 1450. Good luck!')).toBeVisible();
});

test('board settings change the colours and stay after a reload', async ({ page }) => {
  await page.goto('./#/play/board');
  await page.locator('.cf-board-settings summary').click();
  await page.getByRole('button', { name: 'Brown' }).click();
  await expect(page.locator('.cf-board-wrap').first()).toHaveAttribute('data-board-theme', 'brown');
  await page.getByLabel('Show coordinates').uncheck();
  await expect(page.locator('.cf-coord')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.cf-board-wrap').first()).toHaveAttribute('data-board-theme', 'brown');
  await expect(page.locator('.cf-coord')).toHaveCount(0);
});

test('a game can be aborted before your first move, and a rated game changes your rating', async ({ page }) => {
  test.setTimeout(90_000);
  await startGame(page);
  await page.getByRole('button', { name: 'Abort' }).click();
  await expect(page.locator('.cf-bot-play')).toBeVisible();
  await page.goto('./#/play/games');
  await expect(page.getByText('No games yet', { exact: false })).toBeVisible();

  await startGame(page, { rated: true });
  await expect(page.getByText('Rated', { exact: true })).toBeVisible();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('.cf-score-sheet li').first()).toHaveText(/1\.\s*e4\s*\S+/, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('button', { name: 'Yes, resign' }).click();
  await expect(page.getByText(/Bot rating: \d+/)).toBeVisible();
  await expect(page.locator('.cf-rating-change.down')).toBeVisible();
  await page.goto('./#/play');
  await expect(page.getByText(/Your bot rating: \d+/)).toBeVisible();
});
