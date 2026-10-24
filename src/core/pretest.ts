// Guess-first warm-ups made by the app: when a lesson has questions but no warm-up of its own, two or
// three of its easy-to-guess questions are shown first, so the learner tries before reading.

import type { Block, Question } from './types.ts';

const GUESSABLE = new Set(['multiple-choice', 'true-false', 'multi-select']);
const MAX = 3;
/** Fewer questions than this and the warm-up would give the lesson's whole quiz away. */
const MIN_QUESTIONS = 4;

function quizQuestions(blocks: Block[]): Question[] {
  const found: Question[] = [];
  for (const block of blocks) {
    if (block.type !== 'quiz' || block.pretest === true) continue;
    const raw = (block as { questions?: unknown }).questions;
    if (!Array.isArray(raw)) continue;
    for (const q of raw) if (typeof q === 'object' && q !== null && typeof (q as Question).id === 'string') found.push(q as Question);
  }
  return found;
}

/** The warm-up block to show above a lesson, or null when the lesson has its own or too little to use. */
export function autoPretest(lessonId: string, blocks: Block[]): Block | null {
  if (blocks.some((b) => b.pretest === true)) return null;
  const all = quizQuestions(blocks);
  if (all.length < MIN_QUESTIONS) return null;
  const pool = all.filter((q) => GUESSABLE.has(q.kind));
  if (pool.length === 0) return null;
  const count = Math.min(MAX, pool.length);
  const chosen: Question[] = [];
  for (let i = 0; i < count; i++) chosen.push(pool[Math.floor((i * pool.length) / count)]);
  return { id: `pretest-auto-${lessonId}`, type: 'quiz', pretest: true, questions: chosen } as Block;
}
