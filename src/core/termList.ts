// A course from a plain list of terms: "term - meaning" lines typed by hand, or a Quizlet or Anki
// text export. No chat AI involved. Every term becomes a flashcard and three questions (meaning,
// term, type the term), so the list is studied with the same mastery and review as any course.

import { COURSE_SCHEMA_VERSION, type Block, type Course, type Lesson, type Module, type Question } from './types.ts';
import { courseIdFor } from './promptBuilder.ts';
import { normalizeText } from './grade.ts';

export interface Term {
  term: string;
  meaning: string;
}

export type TermSeparator = '\t' | ' - ' | ' – ' | ' — ' | ' = ' | ';' | ':' | ',';

export interface TermList {
  terms: Term[];
  /** The separator that split the lines, or null when the text is not a term list. */
  separator: TermSeparator | null;
  /** Lines that had text but no separator, so they were left out. */
  skipped: string[];
  /** Terms that appeared more than once; only the first one is kept. */
  duplicates: string[];
}

// Checked in this order. Tab first (exports), then the dashes people type, then the punctuation
// that also shows up inside meanings, so a meaning with a comma does not decide the split.
const SEPARATORS: TermSeparator[] = ['\t', ' - ', ' – ', ' — ', ' = ', ';', ':', ','];

/** Fewer terms than this is not worth a course; a quiz needs a few wrong options to choose from. */
export const MIN_TERMS = 4;

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** Anki exports keep their HTML; the app wants plain text. */
function plain(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits one CSV-style line, honouring "quoted, fields". Only the first two fields matter. */
function splitQuoted(line: string, sep: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (line.startsWith(sep, i)) {
      out.push(field);
      field = '';
      i += sep.length - 1;
    } else field += c;
  }
  out.push(field);
  return out;
}

function splitLine(line: string, sep: TermSeparator): Term | null {
  // Single-character separators may sit inside quotes (CSV); typed dashes split at the first one,
  // so a meaning can contain more dashes.
  const parts = sep.length === 1 ? splitQuoted(line, sep) : [line.slice(0, line.indexOf(sep)), line.slice(line.indexOf(sep) + sep.length)];
  if (parts.length < 2 || !line.includes(sep)) return null;
  const term = plain(parts[0]);
  const meaning = plain(sep.length === 1 && sep !== '\t' ? parts.slice(1).join(sep) : parts[1]);
  return term && meaning ? { term, meaning } : null;
}

function contentLines(text: string): string[] {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    // Anki writes settings such as "#separator:tab" at the top of an export.
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** Finds the separator most lines share. Needs four lines in five, so stray prose does not count. */
export function detectSeparator(text: string): TermSeparator | null {
  const lines = contentLines(text);
  // JSON, even broken JSON, is a course for the importer: its errors must still be shown.
  if (lines.length === 0 || /^[[{]/.test(lines[0])) return null;
  for (const sep of SEPARATORS) {
    const hits = lines.filter((line) => splitLine(line, sep) !== null).length;
    if (hits >= MIN_TERMS / 2 && hits / lines.length >= 0.8) return sep;
  }
  return null;
}

export function parseTermList(text: string, separator: TermSeparator | null = detectSeparator(text)): TermList {
  const result: TermList = { terms: [], separator, skipped: [], duplicates: [] };
  if (!separator) return result;
  const seen = new Set<string>();
  for (const line of contentLines(text)) {
    const term = splitLine(line, separator);
    if (!term) {
      result.skipped.push(line);
      continue;
    }
    const key = normalizeText(term.term);
    if (seen.has(key)) {
      result.duplicates.push(term.term);
      continue;
    }
    seen.add(key);
    result.terms.push(term);
  }
  return result;
}

/** Text of the questions in the course's language. The app's own text lives in i18n; these are course content. */
const WORDING = {
  en: {
    meaning: (term: string) => `What does **${term}** mean?`,
    term: (meaning: string) => `Which term fits? ${meaning}`,
    type: (meaning: string) => `Type the term: ${meaning}`,
    match: 'Match each term with its meaning.',
    lesson: (first: number, last: number) => `Terms ${first} to ${last}`,
    goal: (terms: string) => `Know what these mean: ${terms}`,
    words: 'The terms',
    cards: 'Cards',
    summary: (first: string, last: string) => `From ${first} to ${last}.`
  },
  de: {
    meaning: (term: string) => `Was bedeutet **${term}**?`,
    term: (meaning: string) => `Welcher Begriff passt? ${meaning}`,
    type: (meaning: string) => `Schreib den Begriff: ${meaning}`,
    match: 'Ordne jedem Begriff seine Bedeutung zu.',
    lesson: (first: number, last: number) => `Begriffe ${first} bis ${last}`,
    goal: (terms: string) => `Wissen, was das bedeutet: ${terms}`,
    words: 'Die Begriffe',
    cards: 'Karten',
    summary: (first: string, last: string) => `Von ${first} bis ${last}.`
  }
};

export type TermLanguage = keyof typeof WORDING;

export interface TermCourseOptions {
  title: string;
  language: TermLanguage;
  subject?: string;
  /** Terms per lesson and lessons per unit; the defaults keep a lesson to a few minutes. */
  perLesson?: number;
  perUnit?: number;
}

/** A small stable hash, so a term keeps its question ids when the list is imported again. */
function hash(text: string): string {
  let h = 2166136261;
  for (const c of normalizeText(text)) h = Math.imul(h ^ c.codePointAt(0)!, 16777619);
  return (h >>> 0).toString(36);
}

/** Picks `count` other entries, spread over the list and the same every time for the same term. */
function others<T>(all: T[], index: number, count: number): T[] {
  const rest = [...all.slice(index + 1), ...all.slice(0, index)];
  const take = Math.min(count, rest.length);
  return Array.from({ length: take }, (_, j) => rest[Math.floor(((j + 1) * rest.length) / (take + 1))]);
}

/** Puts the right option at a position that depends on the term, so it is not always first. */
function withAnswer(right: string, wrong: string[], seed: string): { options: string[]; answer: number } {
  const at = parseInt(seed, 36) % (wrong.length + 1);
  const options = [...wrong];
  options.splice(at, 0, right);
  return { options, answer: at };
}

/** Accepted spellings: the term, and the term without a bracketed note ("RAM (Arbeitsspeicher)" -> "RAM"). */
function acceptedSpellings(term: string): string[] {
  const short = term.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return short && short !== term ? [term, short] : [term];
}

function termQuestions(terms: Term[], index: number, skillId: string, words: (typeof WORDING)[TermLanguage]): Question[] {
  const { term, meaning } = terms[index];
  const id = hash(term);
  const wrongMeanings = [...new Set(others(terms, index, 3).map((t) => t.meaning))].filter((m) => normalizeText(m) !== normalizeText(meaning));
  const wrongTerms = others(terms, index, 3).map((t) => t.term);
  const askMeaning = withAnswer(meaning, wrongMeanings, id);
  const askTerm = withAnswer(term, wrongTerms, id + 'x');
  const variantGroup = `term-${id}`;
  return [
    { id: `t-${id}-meaning`, kind: 'multiple-choice', prompt: words.meaning(term), ...askMeaning, skillId, variantGroup },
    { id: `t-${id}-term`, kind: 'multiple-choice', prompt: words.term(meaning), ...askTerm, skillId, variantGroup },
    { id: `t-${id}-type`, kind: 'short-answer', prompt: words.type(meaning), answer: acceptedSpellings(term), explanation: `**${term}**: ${meaning}`, skillId, variantGroup }
  ];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const escapeCell = (text: string) => text.replace(/\|/g, '\\|');

/** Builds the course. Lesson and unit ids follow the list order, question ids follow the term. */
export function courseFromTerms(terms: Term[], options: TermCourseOptions): Course {
  const words = WORDING[options.language];
  const perLesson = options.perLesson ?? 8;
  const perUnit = options.perUnit ?? 5;
  const courseId = `list-${courseIdFor(options.title)}`;
  const lessonsOfTerms = chunk(terms.map((term, index) => ({ term, index })), perLesson);

  const lessonOf = new Map<number, string>();
  const modules: Module[] = chunk(lessonsOfTerms, perUnit).map((group, u) => {
    const moduleId = `u${u + 1}`;
    const lessons: Lesson[] = group.map((entries) => {
      const first = entries[0].index + 1;
      const last = entries[entries.length - 1].index + 1;
      const lessonId = `${moduleId}-l${first}`;
      for (const { index } of entries) lessonOf.set(index, lessonId);
      const questions = entries.flatMap(({ index }) => termQuestions(terms, index, lessonId, words));
      if (entries.length >= 3) {
        questions.push({
          id: `${lessonId}-match`,
          kind: 'matching',
          prompt: words.match,
          pairs: entries.slice(0, 5).map(({ term }) => ({ left: term.term, right: term.meaning })),
          skillId: lessonId
        });
      }
      const blocks: Block[] = [
        {
          id: `${lessonId}-list`,
          type: 'text',
          levels: { normal: `| ${words.words} | |\n|---|---|\n${entries.map(({ term }) => `| **${escapeCell(term.term)}** | ${escapeCell(term.meaning)} |`).join('\n')}` }
        },
        { id: `${lessonId}-cards`, type: 'flashcards', title: words.cards, cards: entries.map(({ term }) => ({ front: term.term, back: term.meaning })) },
        { id: `${lessonId}-quiz`, type: 'quiz', questions }
      ];
      return {
        id: lessonId,
        title: words.lesson(first, last),
        goal: words.goal(entries.slice(0, 3).map(({ term }) => term.term).join(', ') + (entries.length > 3 ? ' …' : '.')),
        blocks
      };
    });
    const unitTerms = group.flat();
    // The unit test asks every term once more, the "type it" way first: recall beats recognition.
    const test: Block = {
      id: `${moduleId}-test`,
      type: 'module-test',
      questions: unitTerms.map(({ index }, k) => {
        const [meaning, , typed] = termQuestions(terms, index, lessonOf.get(index)!, words);
        const q = k % 2 === 0 ? typed : meaning;
        return { ...q, id: `${q.id}-test` };
      })
    };
    return {
      id: moduleId,
      title: `${unitTerms[0].term.term} – ${unitTerms[unitTerms.length - 1].term.term}`,
      summary: words.summary(unitTerms[0].term.term, unitTerms[unitTerms.length - 1].term.term),
      lessons,
      test,
      glossary: unitTerms.map(({ term }) => ({ term: term.term, definition: term.meaning }))
    };
  });

  return {
    schemaVersion: COURSE_SCHEMA_VERSION,
    id: courseId,
    title: options.title.trim(),
    ...(options.subject?.trim() ? { subject: options.subject.trim() } : {}),
    language: options.language,
    languages: [options.language],
    version: 1,
    meta: { createdAt: new Date().toISOString().slice(0, 10), tags: ['list'] },
    modules
  };
}
