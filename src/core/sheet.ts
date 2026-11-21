// The cheat sheet: a whole course on a few printed pages. Per lesson its key points, the formulas
// from its text and the mistakes it warns about; at the end every term of the glossary.
// Pure: the screen renders the Markdown and prints.

import { pointsFromMarkdown } from './reflect.ts';
import { resolveCalloutMarkdown, resolveTextLevels, type Lang } from './localize.ts';
import { courseGlossary, glossaryTerms } from './glossary.ts';
import type { Block, Course, Lesson } from './types.ts';

export interface SheetLesson {
  id: string;
  title: string;
  /** Markdown, one point each. */
  points: string[];
  /** The formulas the lesson's text shows, as Markdown ($TeX$ or **plain**). */
  formulas: string[];
  /** Markdown of the lesson's warning callouts ("common mistakes"). */
  warnings: string[];
}

export interface SheetUnit {
  id: string;
  title: string;
  lessons: SheetLesson[];
}

export interface Sheet {
  units: SheetUnit[];
  terms: { term: string; definition: string }[];
}

/** A formula worth keeping: display maths, or inline maths that states something ("U = R \cdot I"). */
export function formulasIn(markdown: string): string[] {
  const out: string[] = [];
  const display = /\$\$([\s\S]+?)\$\$/g;
  for (const m of markdown.matchAll(display)) out.push(m[1].trim());
  const rest = markdown.replace(display, ' ');
  for (const m of rest.matchAll(/(?<![\\$])\$([^$\n]+?)\$(?!\d)/g)) {
    const tex = m[1].trim();
    if (/[=<>≈]|\\(?:approx|leq|geq|neq)\b/.test(tex)) out.push(tex);
  }
  return out;
}

/**
 * Formulas written in bold plain text, as in "**U = W / Q**": a short symbol on the left and letters
 * on the right, so worked results such as "**R = 12 Ω**" or "**2,45 · 10⁻⁸ dm = …**" stay out.
 */
export function plainFormulasIn(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(/\*\*([^*\n]{3,60})\*\*/g)) {
    const [left, ...right] = m[1].split('=');
    if (right.length === 0) continue;
    if (!/^\s*[\p{L}Δ][\p{L}₀-₉\d_]{0,5}\s*$/u.test(left)) continue;
    // A side needs a symbol, must not be just a number with a unit, and has no real words in it.
    if (!right.every((side) => /\p{L}/u.test(side) && !/^\s*[\d,.]+\s*\p{L}{0,3}\s*$/u.test(side) && !/\p{L}{4,}/u.test(side.replace(/\\[a-z]+/g, '')))) continue;
    out.push(m[1].trim());
  }
  return out;
}

/**
 * What a lesson says, in the sheet's language: the bullets of its key point boxes, or else the first
 * two sentences of its text. Not the lesson goal: a goal says what you will be able to do, not the
 * fact itself, and goals have no translation, so they would mix languages on the sheet.
 */
function sheetPoints(blocks: Block[], lang: Lang): string[] {
  const points = blocks
    .filter((b) => b.type === 'callout' && b.style === 'keypoint')
    .flatMap((b) => pointsFromMarkdown(resolveCalloutMarkdown(b, lang)));
  if (points.length > 0) return [...new Set(points)];
  const text = blocks.find((b) => b.type === 'text');
  return text ? openingPoints(resolveTextLevels(text, lang).normal ?? '').slice(0, 2) : [];
}

const NOT_PROSE = /^(#|[-*+] |\d+[.)] |\||>|```|\$\$)/;
const LIST_ITEM = /^([-*+]|\d+[.)])\s+/;

/**
 * The opening sentences of a text. A sentence that leads into a list ("It depends on:") takes the
 * list's first items along, since the list is the point: "It depends on: the material; the length".
 */
function openingPoints(markdown: string): string[] {
  const lines = markdown.split('\n').map((line) => line.trim());
  const start = lines.findIndex((line) => line && !NOT_PROSE.test(line));
  if (start === -1) return [];
  let end = start;
  while (end < lines.length && lines[end] && !NOT_PROSE.test(lines[end])) end++;
  const sentences = pointsFromMarkdown(lines.slice(start, end).join(' '));
  const last = sentences.length - 1;
  if (last >= 0 && sentences[last].endsWith(':')) {
    const items: string[] = [];
    for (let i = end; i < lines.length && items.length < 5; i++) {
      if (LIST_ITEM.test(lines[i])) items.push(pointsFromMarkdown(lines[i])[0] ?? '');
      else if (lines[i] && items.length > 0) break;
    }
    const listed = items.filter(Boolean).map((item) => item.replace(/[.,;]$/, ''));
    if (listed.length > 0) sentences[last] = `${sentences[last]} ${listed.join('; ')}`;
    else sentences.pop();
  }
  return sentences;
}

/** The same formula written twice with other spacing is one formula. */
const formulaKey = (tex: string) => tex.replace(/\s+/g, '');

function lessonSheet(lesson: Lesson, lang: Lang): SheetLesson {
  const blocks: Block[] = lesson.blocks ?? [];
  const formulas: string[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const text =
      block.type === 'text' ? (resolveTextLevels(block, lang).normal ?? '') : block.type === 'callout' || block.type === 'example' ? resolveCalloutMarkdown(block, lang) : '';
    const found = [...formulasIn(text).map((tex) => [tex, `$${tex}$`]), ...plainFormulasIn(text).map((plain) => [plain, `**${plain}**`])];
    for (const [key, markdown] of found) {
      if (seen.has(formulaKey(key))) continue;
      seen.add(formulaKey(key));
      formulas.push(markdown);
    }
  }
  const warnings = blocks
    .filter((b) => b.type === 'callout' && b.style === 'warning')
    .map((b) => resolveCalloutMarkdown(b, lang).trim())
    .filter(Boolean);
  return { id: lesson.id, title: lesson.title, points: sheetPoints(blocks, lang), formulas, warnings };
}

export function courseSheet(course: Course, lang: Lang, moduleId?: string): Sheet {
  const modules = moduleId ? course.modules.filter((m) => m.id === moduleId) : course.modules;
  const units = modules.map((m) => ({ id: m.id, title: m.title, lessons: (m.lessons ?? []).map((l) => lessonSheet(l, lang)) }));
  const entries = moduleId ? (modules[0]?.glossary ?? []) : courseGlossary(course);
  const terms = glossaryTerms(entries, lang)
    .map(({ term, definition }) => ({ term, definition }))
    .sort((a, b) => a.term.localeCompare(b.term, lang, { sensitivity: 'base' }));
  return { units, terms };
}
