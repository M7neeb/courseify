// Pure course search, shared by the header search box and the Library filter, so the two always
// agree on what "matches". No storage and no DOM, so it is unit tested directly.

import type { Course, GlossaryEntry, Lesson } from './types.ts';
import { courseGlossary, glossaryTerms, termPattern } from './glossary.ts';
import { LANGS, type Lang } from './localize.ts';
import { plainTex } from './speech.ts';

/** The searchable text of one course: its display title, subject, level and tags. */
export function courseHaystack(course: Course, title: string, tags: string[]): string[] {
  return [title, course.subject ?? '', course.level ?? '', ...tags].filter((value) => value.trim() !== '');
}

/** True when the query matches any part of a course. An empty query matches everything. */
export function courseMatches(course: Course, title: string, tags: string[], query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return true;
  return courseHaystack(course, title, tags).some((value) => value.toLocaleLowerCase().includes(needle));
}

export interface LessonHit {
  courseId: string;
  lessonId: string;
  title: string;
  /** A few words around the match when it was found in the lesson text, not the title. */
  snippet?: string;
}

/** Markdown down to the words a reader sees: no code fences, table pipes, emphasis marks or links. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    // Inline maths as its symbols; a $ followed by a digit is money, not maths.
    .replace(/(?<![\\$])\$([^$\n]+?)\$(?!\d)/g, (_, tex: string) => plainTex(tex))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
    .replace(/[*_`#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function strings(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (typeof value === 'object' && value !== null) for (const item of Object.values(value)) strings(item, out);
}

// Questions are left out on purpose: a search result must not give an answer away.
const READING_BLOCKS = new Set(['text', 'callout', 'example', 'flashcards']);

/** Everything there is to read in a lesson, in every language it was written in. */
export function lessonText(lesson: Lesson): string {
  const parts: string[] = [];
  if (lesson.goal) parts.push(lesson.goal);
  for (const block of lesson.blocks) {
    if (!READING_BLOCKS.has(block.type)) continue;
    strings([block.markdown, block.levels, block.cards, block.i18n], parts);
  }
  return plainText(parts.join(' \n '));
}

function snippetAround(text: string, at: number, length: number): string {
  let start = Math.max(0, at - 40);
  let end = Math.min(text.length, at + length + 60);
  if (start > 0) start = text.indexOf(' ', start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(' ', end) > at + length ? text.lastIndexOf(' ', end) : end;
  return (start > 0 ? '… ' : '') + text.slice(start, end) + (end < text.length ? ' …' : '');
}

/**
 * Lessons that mention the query. A match in the title ranks before a match in the text, and
 * every word of the query has to appear somewhere in the lesson.
 */
export function searchLessons(courses: readonly Course[], query: string, limit = 8): LessonHit[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0 || words.every((word) => word.length < 2)) return [];
  const inTitle: LessonHit[] = [];
  const inText: LessonHit[] = [];
  for (const course of courses) {
    for (const module of course.modules) {
      for (const lesson of module.lessons) {
        const title = lesson.title.toLocaleLowerCase();
        if (words.every((word) => title.includes(word))) {
          inTitle.push({ courseId: course.id, lessonId: lesson.id, title: lesson.title });
          continue;
        }
        if (inText.length >= limit) continue;
        const text = lessonText(lesson);
        const lower = text.toLocaleLowerCase();
        if (!words.every((word) => lower.includes(word) || title.includes(word))) continue;
        // Show the words together where the text has them that way, else the first one found.
        const phrase = words.join(' ');
        const shown = lower.includes(phrase) ? phrase : (words.find((word) => lower.includes(word)) ?? '');
        inText.push({
          courseId: course.id,
          lessonId: lesson.id,
          title: lesson.title,
          snippet: snippetAround(text, lower.indexOf(shown), shown.length)
        });
      }
    }
  }
  return [...inTitle, ...inText].slice(0, limit);
}

export interface TermHit {
  courseId: string;
  term: string;
  definition: string;
  /** The first lesson whose text uses the term, to open from the result. */
  lessonId?: string;
}

/**
 * Glossary terms whose name (or another spelling) contains the query, in either language. A term
 * that starts with the query ranks first, so "ohm" finds "Ohm" before "Ohmsches Gesetz".
 */
export function searchTerms(courses: readonly Course[], query: string, limit = 4, langOf: (courseId: string) => Lang = () => 'en'): TermHit[] {
  const q = query.trim().toLocaleLowerCase();
  if (q.length < 2) return [];
  const starts: TermHit[] = [];
  const contains: TermHit[] = [];
  const seen = new Set<string>();
  for (const course of courses) {
    const entries = courseGlossary(course);
    // The lesson to open is found by the term's spellings in every language.
    const everyWay = (entry: GlossaryEntry) => [entry.term, ...(entry.aliases ?? []), ...Object.values(entry.i18n ?? {}).flatMap((x) => [x.term ?? '', ...(x.aliases ?? [])])];
    const first = langOf(course.id);
    for (const entry of entries) {
      for (const lang of [first, ...LANGS.filter((l) => l !== first)]) {
        const [shown] = glossaryTerms([entry], lang);
        if (!shown) continue;
        const words = shown.words.map((w) => w.toLocaleLowerCase());
        const leading = words.some((w) => w.startsWith(q));
        if (!leading && !words.some((w) => w.includes(q))) continue;
        const key = `${course.id}:${shown.term.toLocaleLowerCase()}`;
        if (seen.has(key)) break;
        seen.add(key);
        (leading ? starts : contains).push({ courseId: course.id, term: shown.term, definition: plainText(shown.definition), lessonId: lessonUsing(course, everyWay(entry)) });
        break;
      }
    }
  }
  return [...starts.sort((a, b) => a.term.length - b.term.length), ...contains].slice(0, limit);
}

/** Whole words only, two letters or more: an alias like "G" must not match inside "Gesetz". */
function lessonUsing(course: Course, words: readonly string[]): string | undefined {
  const pattern = termPattern(words.filter((w) => w.trim().length >= 2).map((w) => ({ words: [w.trim()], term: w, definition: '' })));
  if (!pattern) return undefined;
  for (const module of course.modules) {
    for (const lesson of module.lessons) {
      pattern.lastIndex = 0;
      if (pattern.test(lessonText(lesson))) return lesson.id;
    }
  }
  return undefined;
}
