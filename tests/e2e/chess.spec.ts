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
  await page.locator('.cf-catalog-item', { hasText: 'Chess: from improver to 1000' }).getByRole('button', { name: 'Add to my courses' }).click();
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

/** Any legal move in the puzzle that is not its first move and does not give mate. */
function wrongMove(q: { fen: string; solution: string[] }): string {
  const first = uciLine(q)[0];
  return new Chess(q.fen)
    .moves({ verbose: true })
    .filter((m) => !m.san.includes('#') && !m.promotion)
    .map((m) => m.from + m.to)
    .find((m) => m !== first)!;
}

async function solve(page: Page, q: { fen: string; solution: string[] }) {
  const line = uciLine(q);
  for (let i = 0; i < line.length; i += 2) {
    await clickMove(page, line[i]!);
    if (i + 2 < line.length) await expect(page.getByText(/to move: move/)).toBeVisible({ timeout: 4000 });
  }
  await expect(page.getByTestId('chess-puzzle').getByText('Solved.')).toBeVisible();
}

test('practising mistakes gives the missed puzzles a fresh board', async ({ page }) => {
  await addChess(page);
  await page.goto('./#/exercise/chess-to-1000/u1-hanging');
  const puzzle = page.getByTestId('chess-puzzle');
  // Miss the first puzzle once, then solve every puzzle in the set.
  let first = true;
  let missedId = '';
  while (!(await page.getByRole('region', { name: 'Results' }).isVisible())) {
    await expect(page.locator('.question')).toBeVisible();
    // Sets mix in a few written questions; only the puzzles matter here.
    if (!(await puzzle.isVisible())) {
      await page.getByRole('button', { name: 'Skip' }).click();
      continue;
    }
    const id = (await puzzle.getAttribute('data-question'))!;
    const q = questions.get(id)!;
    if (first) {
      missedId = id;
      const wrong = wrongMove(q);
      await clickMove(page, wrong);
      await expect(page.getByText('Not this move. Try again.')).toBeVisible();
      await expect(puzzle.locator(`[data-square="${wrong.slice(0, 2)}"] .cf-piece`)).toHaveCount(1, { timeout: 3000 });
      first = false;
    }
    await solve(page, q);
    await page.getByRole('button', { name: /^(Next question|See results)$/ }).first().click();
  }

  await page.getByRole('button', { name: 'Practise mistakes only' }).click();
  await expect(page.getByText('Question 1 of 1')).toBeVisible();
  await expect(puzzle).toHaveAttribute('data-question', missedId);
  await expect(puzzle.getByText('Solved.')).toHaveCount(0);
  await expect(page.getByText('0 of 1 correct')).toBeVisible();
  await solve(page, questions.get(missedId)!);
  await page.getByRole('button', { name: 'See results' }).first().click();
  await expect(page.getByText('1 / 1 correct on first try')).toBeVisible();
});

test('a lesson with missed puzzles unlocks the next one through practice sets', async ({ page }) => {
  // Several full sets of puzzles: longer than the default.
  test.setTimeout(120_000);
  const mc = course.modules[0].lessons[0].blocks.flatMap((b: { questions?: unknown[] }) => b.questions ?? []).find((q: { kind: string }) => q.kind === 'multiple-choice');
  await addChess(page);
  await page.goto('./#/exercise/chess-to-1000/u1-hanging');
  const puzzle = page.getByTestId('chess-puzzle');

  /** Answers every question in the set; with `miss`, plays a wrong move first on each puzzle. */
  async function runSet(miss: boolean) {
    while (!(await page.getByRole('region', { name: 'Results' }).isVisible())) {
      await expect(page.locator('.question')).toBeVisible();
      // Every question in a practice set starts open, never already solved.
      await expect(page.locator('.question')).toHaveAttribute('data-state', 'open');
      if (await puzzle.isVisible()) {
        const q = questions.get((await puzzle.getAttribute('data-question'))!)!;
        if (miss) {
          const wrong = wrongMove(q);
          await clickMove(page, wrong);
          await expect(page.getByText('Not this move. Try again.')).toBeVisible();
          await expect(puzzle.locator(`[data-square="${wrong.slice(0, 2)}"] .cf-piece`)).toHaveCount(1, { timeout: 3000 });
        }
        await solve(page, q);
      } else {
        const show = page.getByRole('button', { name: 'Show the options' });
        if (await show.isVisible()) await show.click();
        await page.getByRole('radio', { name: mc.options[mc.answer] }).check();
        await page.getByRole('button', { name: 'Check', exact: true }).click();
      }
      await page.getByRole('button', { name: /^(Next question|See results)$/ }).first().click();
    }
  }

  await runSet(true);
  await page.goto('./#/course/chess-to-1000/u1-threats');
  await expect(page.locator('.cf-gate-title')).toBeVisible();
  await expect(page.getByText(/counts again once you get it right/)).toBeVisible();

  // New sets bring the missed puzzles back first; solving them first time wins them back.
  for (let round = 0; round < 4; round += 1) {
    await page.goto('./#/exercise/chess-to-1000/u1-hanging');
    await runSet(false);
    await page.goto('./#/course/chess-to-1000/u1-threats');
    if (!(await page.locator('.cf-gate-title').isVisible())) break;
  }
  await expect(page.locator('.cf-gate-title')).toHaveCount(0);
});

test('next question scrolls to the question, not to the top of the page', async ({ page }) => {
  const mc = course.modules[0].lessons[0].blocks.flatMap((b: { questions?: unknown[] }) => b.questions ?? []).find((q: { kind: string }) => q.kind === 'multiple-choice');
  await addChess(page);
  await page.goto('./#/course/chess-to-1000/u1-hanging');
  const show = page.getByRole('button', { name: 'Show the options' });
  if (await show.isVisible()) await show.click();
  await page.getByRole('radio', { name: mc.options[mc.answer] }).check();
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await page.getByRole('button', { name: 'Next question' }).first().click();
  await expect(page.getByTestId('chess-puzzle')).toBeVisible();
  // The lesson text is long, so the quiz is well down the page: it stays there, just under the header.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  const gap = await page.evaluate(() => {
    const header = document.querySelector('.cf-header')!.getBoundingClientRect().bottom;
    return document.querySelector('.block.quiz')!.getBoundingClientRect().top - header;
  });
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(40);
});
