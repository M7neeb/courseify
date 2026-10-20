import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';

// The chess course: adding it, stepping through an example, solving and missing puzzles, playing a
// position out against the computer and the practice board.

const course = JSON.parse(readFileSync(new URL('../../courses/chess-to-1000.json', import.meta.url), 'utf8'));
const questions = new Map<string, { fen: string; solution: string[] }>();
for (const mod of course.modules) {
  for (const lesson of mod.lessons) for (const block of lesson.blocks) for (const q of block.questions ?? []) if (q.kind === 'chess') questions.set(q.id, q);
  for (const q of mod.test.questions) questions.set(q.id, q);
}

/** The puzzle's moves as UCI, from its SAN solution. */
function uciLine(q: { fen: string; solution: string[] }): string[] {
  const game = new Chess(q.fen);
  return q.solution.map((san) => {
    const m = game.move(san);
    return m.from + m.to + (m.promotion ?? '');
  });
}

async function addChess(page: Page) {
  await page.goto('./#/home');
  await page.getByRole('button', { name: 'Add to my courses' }).click();
  await expect(page.getByRole('heading', { name: 'Unit 1: Stop losing pieces' })).toBeVisible();
}

/** Opens every lesson of the chess course (its own setting, the app stays locked). */
async function unlockChess(page: Page) {
  await page.goto('./#/settings/chess-to-1000');
  await page.getByLabel(/^Lesson gating/).selectOption('free');
  await expect(page.getByText('Own setting for this course')).toBeVisible();
}

async function clickMove(page: Page, uci: string) {
  const board = page.getByTestId('chess-puzzle');
  await board.locator(`[data-square="${uci.slice(0, 2)}"]`).click();
  await board.locator(`[data-square="${uci.slice(2, 4)}"]`).click();
  // Promotions in the course always become a queen unless they say otherwise.
  if (uci.length === 5) await page.getByRole('dialog', { name: 'Promote to' }).getByRole('button', { name: { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[uci[4] as 'q'] }).click();
}

test('add the chess course and step through a worked example', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await addChess(page);
  await unlockChess(page);
  await page.goto('./#/course/chess-to-1000/u2-fork');
  const example = page.getByRole('region', { name: 'Worked example on a chessboard' });
  await expect(example.getByText('a knight jump away from the same square')).toBeVisible();
  await example.getByRole('button', { name: 'Start' }).click();
  await expect(example.getByText('That is a fork.')).toBeVisible();
  await example.getByRole('button', { name: 'Next move' }).click();
  await example.getByRole('button', { name: 'Next move' }).click();
  await expect(example.getByText('White wins the queen.')).toBeVisible();
  await expect(example.getByText('1. Nc7+ Kd7 2. Nxa8')).toBeVisible();
  // The practice board shows up once a chess course is in the library.
  await page.goto('./#/library');
  await expect(page.getByText('In your library', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('solve a puzzle by playing the moves, and a wrong move is taken back', async ({ page }) => {
  await addChess(page);
  await page.goto('./#/exercise/chess-to-1000/u2-fork');
  const puzzle = page.getByTestId('chess-puzzle');
  await expect(puzzle).toBeVisible();
  const id = (await puzzle.getAttribute('data-question'))!;
  const q = questions.get(id)!;
  const line = uciLine(q);

  // A wrong move first: any legal move that is not the solution and not a mate.
  const game = new Chess(q.fen);
  const wrong = game
    .moves({ verbose: true })
    .map((m) => m.from + m.to + (m.promotion ?? ''))
    .find((m) => m !== line[0] && m.length === 4 && !new Chess(q.fen).move({ from: m.slice(0, 2), to: m.slice(2, 4) }).san.includes('#'))!;
  await clickMove(page, wrong);
  await expect(page.getByText('Not this move. Try again.')).toBeVisible();
  await expect(page.getByText(/Your opponent|Try again|Not quite/).first()).toBeVisible();
  // The board is back at the puzzle position.
  await expect(puzzle.locator(`[data-square="${wrong.slice(0, 2)}"] .cf-piece`)).toHaveCount(1, { timeout: 3000 });

  for (let i = 0; i < line.length; i += 2) {
    await clickMove(page, line[i]!);
    if (i + 2 < line.length) await expect(page.getByText(/to move: move/)).toBeVisible({ timeout: 4000 });
  }
  await expect(puzzle.getByText('Solved.')).toBeVisible();
  await expect(page.getByText('Correct', { exact: false }).first()).toBeVisible();
});

test('a hint marks the piece, and the full solution plays itself', async ({ page }) => {
  await addChess(page);
  await page.goto('./#/exercise/chess-to-1000/u3-mate1');
  const puzzle = page.getByTestId('chess-puzzle');
  const q = questions.get((await puzzle.getAttribute('data-question'))!)!;
  const first = uciLine(q)[0]!;
  await page.getByRole('button', { name: 'Get a hint' }).click();
  await expect(puzzle.locator(`[data-square="${first.slice(0, 2)}"]`)).toHaveAttribute('data-mark', 'hint');
  await page.getByRole('button', { name: 'Get a hint' }).click();
  await expect(puzzle.locator('.cf-arrows line')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show full solution' }).click();
  await expect(puzzle.getByText('This was the solution.')).toBeVisible({ timeout: 6000 });
});

test('play a position out against the computer, and the practice board', async ({ page }) => {
  await addChess(page);
  await unlockChess(page);
  await page.goto('./#/course/chess-to-1000/u4-queen-rook');
  const play = page.locator('.cf-chess-play').first();
  await expect(play.getByText('checkmate the king.')).toBeVisible();
  await play.locator('[data-square="d1"]').click();
  await play.locator('[data-square="d3"]').click();
  // The computer answers: the move list has White's move and Black's reply.
  await expect(play.locator('.cf-chess-moves')).toHaveText(/^1\. Qd3 K\w+$/, { timeout: 6000 });
  await play.getByRole('button', { name: 'Take back' }).click();
  await expect(play.getByText('No moves yet.')).toBeVisible();

  await page.goto('./#/play');
  await expect(page.getByRole('heading', { name: 'Chess board' })).toBeVisible();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('.cf-chess-moves')).toHaveText(/^1\. e4 \S+/, { timeout: 6000 });
  await page.getByRole('button', { name: 'New game as Black' }).click();
  // As Black, the computer opens.
  await expect(page.locator('.cf-chess-moves')).toHaveText(/^1\. \S+$/, { timeout: 6000 });
});
