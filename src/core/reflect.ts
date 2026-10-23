// Reflection after a lesson or unit, built on two techniques that turn reading into recall:
//
// - Brain dump (also called blurting or blank-page recall): close the lesson, write everything you
//   remember, then compare with the key points and fill the gaps. It is free recall, the strongest
//   form of retrieval practice.
// - Explain it simply (the Feynman technique): explain the idea in plain words as if to a
//   12-year-old. Where you need jargon or get stuck is exactly where your understanding has a gap.
//
// Pure logic, no storage: key points come from the course content, the learner's texts are saved
// by the screens through `updateProgress`.

import { resolveCalloutMarkdown, resolveTextLevels, type Lang } from './localize.ts';
import type { Block, Lesson, Module } from './types.ts';

const MAX_POINTS = 12;

/** Plain text of a Markdown line: no list markers, emphasis, links or code ticks. */
function plain(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits Markdown into its list items, or into sentences when it is one paragraph. */
function pointsFromMarkdown(markdown: string): string[] {
  const lines = markdown.split(/\n+/).map(plain).filter((line) => line.length > 2);
  if (lines.length > 1) return lines;
  const text = lines[0] ?? '';
  return text
    .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/**
 * The key points of a lesson: the bullet points of its "keypoint" callouts. Without any, the
 * lesson goal stands in, and without a goal the first sentences of the explanation.
 */
export function lessonKeyPoints(lesson: Lesson, lang: Lang): string[] {
  const out: string[] = [];
  for (const block of lesson.blocks ?? []) {
    if (block.type === 'callout' && block.style === 'keypoint') out.push(...pointsFromMarkdown(resolveCalloutMarkdown(block as Block, lang)));
  }
  if (out.length === 0 && lesson.goal) out.push(plain(lesson.goal));
  if (out.length === 0) {
    const text = (lesson.blocks ?? []).find((b) => b.type === 'text');
    const normal = text ? (resolveTextLevels(text as Block, lang).normal ?? '') : '';
    out.push(...pointsFromMarkdown(normal).slice(0, 3));
  }
  return [...new Set(out)].slice(0, MAX_POINTS);
}

/** The key points of a whole unit: every lesson's points, in order. */
export function unitKeyPoints(module: Module, lang: Lang): string[] {
  const out: string[] = [];
  for (const lesson of module.lessons ?? []) out.push(...lessonKeyPoints(lesson, lang));
  return [...new Set(out)].slice(0, MAX_POINTS * 3);
}

/** Lowercased word stems (first 5 letters) of the meaningful words in a text. */
function stems(text: string): string[] {
  return (text.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => word.length >= 4 || /\d/.test(word))
    .map((word) => word.slice(0, 5));
}

/**
 * A first guess at which key points a brain dump covers: a point counts when at least half of its
 * distinctive words (by stem) appear in the dump. The learner checks and corrects the ticks, so
 * this only saves clicks; it never grades.
 */
export function guessCovered(dump: string, points: string[]): number[] {
  const words = new Set(stems(dump));
  const perPoint = points.map((point) => [...new Set(stems(point))]);
  // Words that appear in most points ("host", "bits") do not tell the points apart, so a point is
  // judged by its own distinctive words when it has any.
  const spread = new Map<string, number>();
  for (const list of perPoint) for (const stem of list) spread.set(stem, (spread.get(stem) ?? 0) + 1);
  const common = (stem: string) => points.length >= 2 && (spread.get(stem) ?? 0) > points.length / 2;
  const out: number[] = [];
  perPoint.forEach((all, index) => {
    const distinctive = all.filter((stem) => !common(stem));
    const needed = distinctive.length > 0 ? distinctive : all;
    if (needed.length === 0) return;
    const found = needed.filter((stem) => words.has(stem)).length;
    if (found / needed.length >= 0.5) out.push(index);
  });
  return out;
}

/** Share (0-100) of key points covered. */
export function coveragePercent(covered: number[] | undefined, total: number): number {
  if (total <= 0) return 0;
  return Math.round((new Set(covered ?? []).size / total) * 100);
}

/** Words longer than 12 letters: likely jargon worth explaining in plainer words. */
export function longWords(text: string): string[] {
  const found = (text.match(/[\p{L}-]{13,}/gu) ?? []).map((w) => w.toLowerCase());
  return [...new Set(found)].slice(0, 8);
}

function languageName(code: string): string {
  return code === 'de' ? 'German' : 'English';
}

/** The lesson's own text to compare against: key points plus the main explanation. */
export function lessonDigest(lesson: Lesson, lang: Lang, limit = 6000): string {
  const parts: string[] = [];
  for (const block of lesson.blocks ?? []) {
    if (block.type === 'text') parts.push(resolveTextLevels(block as Block, lang).normal ?? '');
    if (block.type === 'callout' || block.type === 'example') parts.push(resolveCalloutMarkdown(block as Block, lang));
  }
  const text = parts.filter(Boolean).join('\n\n');
  return text.length > limit ? text.slice(0, limit) + '\n[...]' : text;
}

/** Copied prompt: compare my brain dump with the lesson and tell me what is missing or wrong. */
export function dumpFeedbackPrompt(topic: string, source: string, dump: string, lang: Lang): string {
  return [
    `I am studying "${topic}". I closed my notes and wrote down everything I remember (a brain dump). Compare it with the lesson below.`,
    '## My brain dump',
    dump.trim() || '(empty)',
    '## The lesson',
    source.trim(),
    '## What I need from you',
    [
      '- First list what I got RIGHT (short).',
      '- Then list what is WRONG or confused in my dump, and correct it in one sentence each.',
      '- Then list the important points I MISSED, most important first.',
      '- Do not rewrite the whole lesson. Keep it short and concrete.',
      '- End with 2 questions that test the points I missed, without the answers.',
      `- Reply in ${languageName(lang)}.`
    ].join('\n')
  ].join('\n\n');
}

/**
 * Copied prompt for the Feynman technique: the chat assistant plays a curious 12-year-old who asks about
 * the gaps, then points out mistakes. Teaching someone is one of the best ways to find what you
 * do not understand yet.
 */
export function feynmanPrompt(topic: string, explanation: string, lang: Lang): string {
  return [
    `I am learning "${topic}" and I am using the Feynman technique: I explained it in simple words below.`,
    '## My explanation',
    explanation.trim() || '(empty)',
    '## What I need from you',
    [
      '- Play a curious, smart 12-year-old. Ask me 3 short follow-up questions, one at a time, about the parts of my explanation that are vague, use jargon, or skip a step. Wait for my answer after each question.',
      '- After my answers, step out of the role and tell me plainly: anything that is factually wrong, and the one gap I should study again.',
      '- Do not explain the topic to me before I have tried to answer.',
      `- Reply in ${languageName(lang)}.`
    ].join('\n')
  ].join('\n\n');
}
