// Language resolution for course content. For the chosen language we prefer the block's
// `i18n[lang]` entry and fall back to the legacy top-level field, so version 1 courses keep working.

import type { Block, ExplanationLevel, I18nText, Question } from './types.ts';

export type Lang = 'en' | 'de';
export const LANGS: Lang[] = ['en', 'de'];

const LEVELS: ExplanationLevel[] = ['normal', 'simple', 'detailed'];

function langEntry(value: unknown, lang: string): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const entry = (value as Record<string, unknown>)[lang];
  return typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    ? (entry as Record<string, unknown>)
    : undefined;
}

function pick(...candidates: unknown[]): string | undefined {
  for (const c of candidates) if (typeof c === 'string' && c.trim() !== '') return c;
  return undefined;
}

/** Text-block levels for the chosen language: `i18n[lang]` first, then legacy `levels`, then `markdown`. */
export function resolveTextLevels(block: Block, lang: Lang): Partial<Record<ExplanationLevel, string>> {
  const localized = langEntry(block.i18n, lang);
  const legacy = typeof block.levels === 'object' && block.levels !== null ? (block.levels as Record<string, unknown>) : undefined;
  const out: Partial<Record<ExplanationLevel, string>> = {};
  for (const level of LEVELS) {
    const value = pick(localized?.[level], legacy?.[level]);
    if (value !== undefined) out[level] = value;
  }
  if (out.normal === undefined) {
    const fallback = pick(block.markdown);
    if (fallback !== undefined) out.normal = fallback;
  }
  return out;
}

/** Callout/explanatory markdown for the chosen language: `i18n[lang].markdown`, else top-level `markdown`. */
export function resolveCalloutMarkdown(block: Block, lang: Lang): string {
  const localized = langEntry(block.i18n, lang);
  return pick(localized?.markdown, localized?.normal, block.markdown) ?? '';
}

/** Image alt text for the chosen language: `i18n[lang].alt`, else the top-level `alt`. */
export function resolveImageAlt(block: Block, lang: Lang): string {
  const localized = langEntry(block.i18n, lang);
  return pick(localized?.alt, block.alt) ?? '';
}

/** Image caption for the chosen language: `i18n[lang].caption`, else the top-level `caption`. */
export function resolveImageCaption(block: Block, lang: Lang): string {
  const localized = langEntry(block.i18n, lang);
  return pick(localized?.caption, block.caption) ?? '';
}

export interface Flashcard {
  front: string;
  back: string;
}

function isFlashcard(value: unknown): value is Flashcard {
  if (typeof value !== 'object' || value === null) return false;
  const card = value as Record<string, unknown>;
  return typeof card.front === 'string' && typeof card.back === 'string';
}

/** Flashcards for the chosen language: `i18n[lang].cards`, else the top-level `cards`. */
export function resolveFlashcards(block: Block, lang: Lang): Flashcard[] {
  const localized = langEntry(block.i18n, lang)?.cards;
  if (Array.isArray(localized) && localized.length > 0 && localized.every(isFlashcard)) return localized;
  return Array.isArray(block.cards) ? (block.cards as unknown[]).filter(isFlashcard) : [];
}

/** A question with prompt/options/answer/explanation/hint resolved for the chosen language. */
export function resolveQuestion(q: Question, lang: Lang): Question {
  const localized = q.i18n?.[lang];
  if (!localized) return q;
  const out: Question = { ...q };
  if (typeof localized.prompt === 'string' && localized.prompt.trim() !== '') out.prompt = localized.prompt;
  if (Array.isArray(localized.options) && localized.options.length > 0) out.options = localized.options;
  if (localized.answer !== undefined) out.answer = localized.answer;
  if (typeof localized.explanation === 'string') out.explanation = localized.explanation;
  if (typeof localized.hint === 'string') out.hint = localized.hint;
  if (Array.isArray(localized.hints) && localized.hints.length > 0) out.hints = localized.hints;
  // Per-option rationales must stay parallel to the (localized) options, so an empty list is kept.
  if (Array.isArray(localized.rationales)) out.rationales = localized.rationales;
  if (Array.isArray(localized.pairs) && localized.pairs.length > 0) out.pairs = localized.pairs;
  if (Array.isArray(localized.items) && localized.items.length > 0) out.items = localized.items;
  if (Array.isArray(localized.points) && localized.points.length > 0) out.points = localized.points;
  if (Array.isArray(localized.columns) && localized.columns.length > 0) out.columns = localized.columns;
  if (typeof localized.svg === 'string' && localized.svg.trim() !== '') out.svg = localized.svg;
  if (typeof localized.alt === 'string' && localized.alt.trim() !== '') out.alt = localized.alt;
  if (Array.isArray(localized.areaLabels) && out.areas) {
    const labels = localized.areaLabels;
    out.areas = out.areas.map((a, i) => (typeof labels[i] === 'string' && labels[i] !== '' ? { ...a, label: labels[i] } : a));
  }
  return out;
}

/**
 * The per-option "why that is not right" text, if this question carries one for that option.
 * Works on a question already resolved with `resolveQuestion` for the chosen language.
 */
export function rationaleFor(q: Question, optionIndex: number): string | undefined {
  const text = q.rationales?.[optionIndex];
  return typeof text === 'string' && text.trim() !== '' ? text : undefined;
}

export function resolveQuestions(block: Block, lang: Lang): Question[] {
  const raw = Array.isArray(block.questions) ? (block.questions as Question[]) : [];
  return raw.map((q) => resolveQuestion(q, lang));
}

/** Used by tests and tooling: the localized text variants declared for a language, if any. */
export function textI18nFor(block: Block, lang: string): I18nText | undefined {
  const localized = langEntry(block.i18n, lang);
  return localized ? (localized as I18nText) : undefined;
}

/**
 * The supported languages a set of blocks actually has content in: any `i18n` entry on a block or
 * on one of its questions counts. The lesson's language switch only appears when this finds both.
 */
export function blockLanguages(blocks: Block[]): Lang[] {
  const found = new Set<Lang>();
  const scan = (value: unknown) => {
    for (const lang of LANGS) if (langEntry(value, lang)) found.add(lang);
  };
  for (const block of blocks) {
    scan(block.i18n);
    const questions = (block as { questions?: unknown }).questions;
    if (Array.isArray(questions)) for (const q of questions) scan((q as { i18n?: unknown } | null)?.i18n);
  }
  return LANGS.filter((lang) => found.has(lang));
}
