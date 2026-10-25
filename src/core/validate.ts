import type { Course, Question, QuestionKind } from './types.ts';
import { chessBlockErrors, chessQuestionErrors } from './chess.ts';
import { drillById } from './drills.ts';
import { graphErrors } from './graph.ts';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  course?: Course;
}

const QUESTION_KINDS: QuestionKind[] = [
  'multiple-choice',
  'true-false',
  'short-answer',
  'fill-blank',
  'numeric',
  'multi-select',
  'matching',
  'ordering',
  'chess',
  'written',
  'hotspot',
  'code',
  'sql',
  'trace',
  'shell'
];
const CODE_LANGUAGES = ['python', 'javascript'];
const QUIZ_TYPES = ['quiz', 'module-test', 'final-exam'];
/** Block types the player can render today. */
export const RENDERED_BLOCK_TYPES = ['text', 'callout', 'video', 'image', 'example', 'flashcards', 'code', 'drill', 'graph', 'occlusion', ...QUIZ_TYPES];
/** Block types the schema reserves for later features; they validate but show a placeholder. */
export const PLANNED_BLOCK_TYPES = ['exercise'];

const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Checks a course the way the player needs it. Unknown fields are ignored on purpose so that
 * courses made for a newer app still open. Missing lesson.blocks becomes [] (outline stubs).
 */
export function validateCourse(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(input)) {
    return { ok: false, errors: ['The file must contain one JSON object.'], warnings };
  }

  const course = structuredClone(input) as Record<string, unknown>;

  if (typeof course.schemaVersion !== 'number') errors.push('schemaVersion: must be a number (use 1).');
  if (!isNonEmptyString(course.id) || !ID_PATTERN.test(course.id)) {
    errors.push('id: required, letters/numbers/dash/underscore/dot only, no spaces.');
  }
  if (!isNonEmptyString(course.title)) errors.push('title: required text.');
  if (!Array.isArray(course.modules)) {
    errors.push('modules: must be a list.');
    return { ok: false, errors, warnings };
  }

  const seen = {
    module: new Set<string>(),
    lesson: new Set<string>(),
    block: new Set<string>(),
    question: new Set<string>()
  };

  function unique(kind: keyof typeof seen, id: string, path: string) {
    if (seen[kind].has(id)) errors.push(`${path}: duplicate ${kind} id "${id}".`);
    seen[kind].add(id);
  }

  const TEXT_LEVELS = ['normal', 'simple', 'detailed'];

  /** True when a block has at least one usable localized text variant. */
  function hasI18nText(value: unknown): boolean {
    if (!isObject(value)) return false;
    return Object.values(value).some((entry) => isObject(entry) && TEXT_LEVELS.some((k) => isNonEmptyString(entry[k])));
  }

  function checkI18nText(value: unknown, path: string) {
    if (!isObject(value)) {
      errors.push(`${path}: must be an object keyed by language.`);
      return;
    }
    for (const [lang, rawEntry] of Object.entries(value)) {
      if (!isObject(rawEntry)) {
        errors.push(`${path}.${lang}: must be an object.`);
        continue;
      }
      for (const k of TEXT_LEVELS) {
        if (rawEntry[k] !== undefined && typeof rawEntry[k] !== 'string') {
          errors.push(`${path}.${lang}.${k}: must be text.`);
        }
      }
    }
  }

  function checkQuestion(q: unknown, path: string) {
    if (!isObject(q)) {
      errors.push(`${path}: must be an object.`);
      return;
    }
    if (!isNonEmptyString(q.id)) errors.push(`${path}.id: required.`);
    else unique('question', q.id, `${path}.id`);
    if (!isNonEmptyString(q.prompt)) errors.push(`${path}.prompt: required text.`);
    if (typeof q.kind !== 'string' || !QUESTION_KINDS.includes(q.kind as QuestionKind)) {
      errors.push(`${path}.kind: must be one of ${QUESTION_KINDS.join(', ')}.`);
      return;
    }
    if (q.explanation !== undefined && typeof q.explanation !== 'string') {
      errors.push(`${path}.explanation: must be text.`);
    }
    if (q.hint !== undefined && typeof q.hint !== 'string') {
      errors.push(`${path}.hint: must be text.`);
    }
    if (q.hints !== undefined && (!Array.isArray(q.hints) || !q.hints.every((h) => typeof h === 'string'))) {
      errors.push(`${path}.hints: must be a list of text.`);
    }
    if (q.skillId !== undefined && !isNonEmptyString(q.skillId)) {
      errors.push(`${path}.skillId: must be text.`);
    }
    if (q.variantGroup !== undefined && !isNonEmptyString(q.variantGroup)) {
      errors.push(`${path}.variantGroup: must be text.`);
    }
    if (q.tolerance !== undefined && (typeof q.tolerance !== 'number' || !Number.isFinite(q.tolerance))) {
      errors.push(`${path}.tolerance: must be a number.`);
    }
    if (
      q.rationales !== undefined &&
      (!Array.isArray(q.rationales) || !q.rationales.every((r) => typeof r === 'string'))
    ) {
      errors.push(`${path}.rationales: must be a list of text, one per option.`);
    }
    const rawI18n = q.i18n;
    if (rawI18n !== undefined) {
      if (!isObject(rawI18n)) {
        errors.push(`${path}.i18n: must be an object keyed by language.`);
      } else {
        for (const [lang, rawEntry] of Object.entries(rawI18n)) {
          if (!isObject(rawEntry)) {
            errors.push(`${path}.i18n.${lang}: must be an object.`);
            continue;
          }
          if (rawEntry.prompt !== undefined && typeof rawEntry.prompt !== 'string') {
            errors.push(`${path}.i18n.${lang}.prompt: must be text.`);
          }
          if (rawEntry.options !== undefined && (!Array.isArray(rawEntry.options) || !rawEntry.options.every((o) => typeof o === 'string'))) {
            errors.push(`${path}.i18n.${lang}.options: must be a list of text.`);
          }
          if (rawEntry.explanation !== undefined && typeof rawEntry.explanation !== 'string') {
            errors.push(`${path}.i18n.${lang}.explanation: must be text.`);
          }
          if (rawEntry.hint !== undefined && typeof rawEntry.hint !== 'string') {
            errors.push(`${path}.i18n.${lang}.hint: must be text.`);
          }
          if (rawEntry.hints !== undefined && (!Array.isArray(rawEntry.hints) || !rawEntry.hints.every((h) => typeof h === 'string'))) {
            errors.push(`${path}.i18n.${lang}.hints: must be a list of text.`);
          }
          if (
            rawEntry.rationales !== undefined &&
            (!Array.isArray(rawEntry.rationales) || !rawEntry.rationales.every((r) => typeof r === 'string'))
          ) {
            errors.push(`${path}.i18n.${lang}.rationales: must be a list of text.`);
          }
          if (rawEntry.pairs !== undefined) {
            if (!Array.isArray(rawEntry.pairs)) errors.push(`${path}.i18n.${lang}.pairs: must be a list.`);
            else
              rawEntry.pairs.forEach((pair, pi) => {
                if (!isObject(pair) || !isNonEmptyString(pair.left) || !isNonEmptyString(pair.right)) {
                  errors.push(`${path}.i18n.${lang}.pairs[${pi}]: needs non-empty "left" and "right" text.`);
                }
              });
          }
          if (
            rawEntry.items !== undefined &&
            (!Array.isArray(rawEntry.items) || !rawEntry.items.every((i) => typeof i === 'string'))
          ) {
            errors.push(`${path}.i18n.${lang}.items: must be a list of text.`);
          }
          for (const k of ['points', 'areaLabels']) {
            const v = rawEntry[k];
            if (v !== undefined && (!Array.isArray(v) || !v.every((x) => typeof x === 'string'))) errors.push(`${path}.i18n.${lang}.${k}: must be a list of text.`);
          }
          for (const k of ['svg', 'alt']) {
            if (rawEntry[k] !== undefined && typeof rawEntry[k] !== 'string') errors.push(`${path}.i18n.${lang}.${k}: must be text.`);
          }
        }
      }
    }
    const kind = q.kind as Question['kind'];
    if (kind === 'multiple-choice') {
      const opts = q.options;
      if (!Array.isArray(opts) || opts.length < 2 || !opts.every((o) => typeof o === 'string')) {
        errors.push(`${path}.options: need at least 2 text options.`);
      } else if (!Number.isInteger(q.answer) || (q.answer as number) < 0 || (q.answer as number) >= opts.length) {
        errors.push(`${path}.answer: must be the index (starting at 0) of the correct option.`);
      }
    } else if (kind === 'true-false') {
      if (typeof q.answer !== 'boolean') errors.push(`${path}.answer: must be true or false.`);
    } else if (kind === 'short-answer' || kind === 'fill-blank') {
      const a = q.answer;
      const ok = isNonEmptyString(a) || (Array.isArray(a) && a.length > 0 && a.every(isNonEmptyString));
      if (!ok) errors.push(`${path}.answer: must be text or a list of accepted texts.`);
    } else if (kind === 'numeric') {
      if (typeof q.answer !== 'number' || !Number.isFinite(q.answer)) {
        errors.push(`${path}.answer: must be a number.`);
      }
      if (typeof q.tolerance === 'number' && q.tolerance < 0) {
        errors.push(`${path}.tolerance: must not be negative.`);
      }
    } else if (kind === 'multi-select') {
      const opts = q.options;
      if (!Array.isArray(opts) || opts.length < 2 || !opts.every((o) => typeof o === 'string')) {
        errors.push(`${path}.options: need at least 2 text options.`);
      }
      const a = q.answer;
      if (!Array.isArray(a) || a.length === 0 || !a.every((v) => Number.isInteger(v))) {
        errors.push(`${path}.answer: must be a list of correct option indexes.`);
      } else if (Array.isArray(opts)) {
        if (new Set(a).size !== a.length) errors.push(`${path}.answer: option indexes must not repeat.`);
        if (a.some((v) => (v as number) < 0 || (v as number) >= opts.length)) {
          errors.push(`${path}.answer: option indexes must point at an existing option.`);
        }
      }
    } else if (kind === 'matching') {
      const pairs = q.pairs;
      if (!Array.isArray(pairs) || pairs.length < 2) {
        errors.push(`${path}.pairs: need at least 2 {left, right} pairs.`);
      } else {
        pairs.forEach((pair, pi) => {
          if (!isObject(pair) || !isNonEmptyString(pair.left) || !isNonEmptyString(pair.right)) {
            errors.push(`${path}.pairs[${pi}]: needs non-empty "left" and "right" text.`);
          }
        });
      }
    } else if (kind === 'chess') {
      for (const message of chessQuestionErrors(q)) errors.push(`${path}.${message}`);
    } else if (kind === 'ordering') {
      const items = q.items;
      if (!Array.isArray(items) || items.length < 2 || !items.every(isNonEmptyString)) {
        errors.push(`${path}.items: need at least 2 pieces of text.`);
      }
    } else if (kind === 'shell') {
      if (!isObject(q.fs)) errors.push(`${path}.fs: the starting file tree, nested objects with file contents as text.`);
      const g = q.goal;
      const okGoal = isObject(g) && (isNonEmptyString(g.cmd) || isNonEmptyString(g.exists) || isNonEmptyString(g.missing) || isNonEmptyString(g.cwd) || isNonEmptyString(g.file));
      if (!okGoal) errors.push(`${path}.goal: one of { "cmd": "regex" }, { "exists": "/path" }, { "missing": "/path" }, { "cwd": "/path" }, { "file": "/path", "equals": "text" }.`);
      if (q.cwd !== undefined && typeof q.cwd !== 'string') errors.push(`${path}.cwd: a folder path as text.`);
    } else if (kind === 'trace') {
      const cols = q.columns;
      const rows = q.rows;
      const blanks = q.blanks;
      if (!Array.isArray(cols) || cols.length === 0 || !cols.every(isNonEmptyString)) errors.push(`${path}.columns: the column headings, as text.`);
      if (!Array.isArray(rows) || rows.length === 0 || !rows.every((r) => Array.isArray(r) && r.length === (cols as unknown[] | undefined)?.length && r.every((c) => typeof c === 'string'))) errors.push(`${path}.rows: the complete correct table, one list of text per row, as many cells as columns.`);
      else if (!Array.isArray(blanks) || blanks.length === 0 || !blanks.every((b) => Array.isArray(b) && b.length === 2 && Number.isInteger(b[0]) && Number.isInteger(b[1]) && (rows as unknown[][])[b[0] as number] !== undefined && (rows as unknown[][])[b[0] as number][b[1] as number] !== undefined)) errors.push(`${path}.blanks: the cells to fill in, as [row, column] pairs that exist in the table.`);
    } else if (kind === 'sql') {
      if (!isNonEmptyString(q.setup)) errors.push(`${path}.setup: the SQL script that builds the practice database (CREATE TABLE and INSERT).`);
      if (!isNonEmptyString(q.answer)) errors.push(`${path}.answer: the model query (a SELECT) whose result table the learner's must match.`);
      if (q.starter !== undefined && typeof q.starter !== 'string') errors.push(`${path}.starter: must be SQL as text.`);
      if (q.ordered !== undefined && typeof q.ordered !== 'boolean') errors.push(`${path}.ordered: true or false.`);
    } else if (kind === 'code') {
      if (typeof q.language !== 'string' || !CODE_LANGUAGES.includes(q.language)) errors.push(`${path}.language: one of ${CODE_LANGUAGES.join(', ')}.`);
      if (q.starter !== undefined && typeof q.starter !== 'string') errors.push(`${path}.starter: must be code as text.`);
      if (q.answer !== undefined && typeof q.answer !== 'string') errors.push(`${path}.answer: the model solution, as code text.`);
      const tests = q.tests;
      if (!Array.isArray(tests) || tests.length === 0) {
        errors.push(`${path}.tests: need at least one test: { "call": "add(2, 3)", "expect": 5 } or { "output": "Hello" }.`);
      } else {
        tests.forEach((t, ti) => {
          const ok = isObject(t) && ((isNonEmptyString(t.call) && 'expect' in t) || (typeof t.output === 'string' && (t.stdin === undefined || typeof t.stdin === 'string')));
          if (!ok) errors.push(`${path}.tests[${ti}]: use { "call": "...", "expect": value } or { "output": "...", "stdin": "..." }.`);
        });
      }
    } else if (kind === 'written') {
      const points = q.points;
      if (!Array.isArray(points) || points.length < 2 || points.length > 8 || !points.every(isNonEmptyString)) {
        errors.push(`${path}.points: need 2 to 8 key points as text.`);
      }
      if (!isNonEmptyString(q.answer)) errors.push(`${path}.answer: needs a model answer as text.`);
    } else if (kind === 'hotspot') {
      if (!isNonEmptyString(q.image) && !isNonEmptyString(q.svg)) errors.push(`${path}: a hotspot question needs "svg" (inline SVG) or "image" (a URL).`);
      if (q.svg !== undefined && (typeof q.svg !== 'string' || !/^\s*<svg[\s>]/i.test(q.svg))) errors.push(`${path}.svg: must be SVG markup starting with <svg.`);
      const areas = q.areas;
      const inRange = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
      if (!Array.isArray(areas) || areas.length < 2) {
        errors.push(`${path}.areas: need at least 2 areas as { x, y, w, h } in percent.`);
      } else {
        areas.forEach((a, ai) => {
          const ok = isObject(a) && [a.x, a.y, a.w, a.h].every(inRange) && (a.w as number) > 0 && (a.h as number) > 0 && (a.x as number) + (a.w as number) <= 100.5 && (a.y as number) + (a.h as number) <= 100.5;
          if (!ok) errors.push(`${path}.areas[${ai}]: x, y, w, h must be percent (0-100) and stay inside the picture.`);
        });
        if (!Number.isInteger(q.answer) || (q.answer as number) < 0 || (q.answer as number) >= areas.length) {
          errors.push(`${path}.answer: must be the index (starting at 0) of the right area.`);
        }
      }
    }
  }

  function checkBlock(b: unknown, path: string) {
    if (!isObject(b)) {
      errors.push(`${path}: must be an object.`);
      return;
    }
    if (!isNonEmptyString(b.id)) errors.push(`${path}.id: required.`);
    else unique('block', b.id, `${path}.id`);
    if (!isNonEmptyString(b.type)) {
      errors.push(`${path}.type: required.`);
      return;
    }
    const type = b.type;
    if (type === 'text') {
      const levels = b.levels;
      if (levels !== undefined) {
        if (!isObject(levels) || !isNonEmptyString(levels.normal)) {
          errors.push(`${path}.levels: needs at least a "normal" text.`);
        } else {
          for (const k of ['simple', 'detailed']) {
            if (levels[k] !== undefined && typeof levels[k] !== 'string') errors.push(`${path}.levels.${k}: must be text.`);
          }
        }
      } else if (!isNonEmptyString(b.markdown) && !hasI18nText(b.i18n)) {
        errors.push(`${path}: a text block needs "levels" (with "normal"), "markdown" or "i18n".`);
      }
      if (b.i18n !== undefined) checkI18nText(b.i18n, `${path}.i18n`);
    } else if (type === 'callout') {
      if (!isNonEmptyString(b.markdown)) errors.push(`${path}.markdown: required text.`);
    } else if (type === 'example') {
      if (!isNonEmptyString(b.markdown) && !hasI18nText(b.i18n)) {
        errors.push(`${path}: an example block needs "markdown" or "i18n".`);
      }
    } else if (type === 'chess') {
      for (const message of chessBlockErrors(b)) errors.push(`${path}.${message}`);
    } else if (type === 'code') {
      if (typeof b.language !== 'string' || !CODE_LANGUAGES.includes(b.language)) errors.push(`${path}.language: one of ${CODE_LANGUAGES.join(', ')}.`);
      const code = b.code;
      if (!(isNonEmptyString(code) || (Array.isArray(code) && code.length > 0 && code.every((l) => typeof l === 'string')))) errors.push(`${path}.code: required code as text.`);
    } else if (type === 'drill') {
      if (typeof b.drill !== 'string' || !drillById(b.drill)) errors.push(`${path}.drill: an unknown drill "${String(b.drill)}".`);
      if (b.level !== undefined && ![1, 2, 3].includes(b.level as number)) errors.push(`${path}.level: 1, 2 or 3.`);
      if (b.count !== undefined && !(Number.isInteger(b.count) && (b.count as number) >= 1 && (b.count as number) <= 30)) errors.push(`${path}.count: a whole number from 1 to 30.`);
    } else if (type === 'graph') {
      for (const message of graphErrors(b)) errors.push(`${path}.${message}`);
    } else if (type === 'occlusion') {
      if (!isNonEmptyString(b.svg) && !(isNonEmptyString(b.url) && /^https?:\/\//i.test(b.url as string))) errors.push(`${path}: an occlusion block needs "svg" or an https "url".`);
      if (!Array.isArray(b.areas) || b.areas.length === 0) errors.push(`${path}.areas: at least one area { x, y, w, h, label } in percent.`);
      else {
        b.areas.forEach((a, i) => {
          const ok = isObject(a) && ['x', 'y', 'w', 'h'].every((k) => typeof a[k] === 'number' && Number.isFinite(a[k] as number));
          if (!ok) errors.push(`${path}.areas[${i}]: needs numbers x, y, w and h (percent of the picture).`);
          else if ((a.w as number) <= 0 || (a.h as number) <= 0 || (a.x as number) < 0 || (a.y as number) < 0 || (a.x as number) + (a.w as number) > 100 || (a.y as number) + (a.h as number) > 100) errors.push(`${path}.areas[${i}]: must lie inside the picture (0 to 100 percent).`);
        });
      }
    } else if (type === 'video') {
      const hasTerm = isNonEmptyString(b.searchTerm);
      const hasUrl = isNonEmptyString(b.url);
      if (!hasTerm && !hasUrl) errors.push(`${path}: a video block needs "searchTerm" or "url".`);
    } else if (type === 'image') {
      const hasTerm = isNonEmptyString(b.searchTerm);
      const hasUrl = isNonEmptyString(b.url);
      if (!hasTerm && !hasUrl) errors.push(`${path}: an image block needs "url" or "searchTerm".`);
      for (const k of ['alt', 'caption']) {
        if (b[k] !== undefined && typeof b[k] !== 'string') errors.push(`${path}.${k}: must be text.`);
      }
      if (b.i18n !== undefined) {
        if (!isObject(b.i18n)) {
          errors.push(`${path}.i18n: must be an object keyed by language.`);
        } else {
          for (const [lang, rawEntry] of Object.entries(b.i18n)) {
            if (!isObject(rawEntry)) {
              errors.push(`${path}.i18n.${lang}: must be an object.`);
              continue;
            }
            for (const k of ['alt', 'caption']) {
              if (rawEntry[k] !== undefined && typeof rawEntry[k] !== 'string') {
                errors.push(`${path}.i18n.${lang}.${k}: must be text.`);
              }
            }
          }
        }
      }
    } else if (QUIZ_TYPES.includes(type)) {
      if (!Array.isArray(b.questions) || b.questions.length === 0) {
        errors.push(`${path}.questions: need at least one question.`);
      } else {
        b.questions.forEach((q, i) => checkQuestion(q, `${path}.questions[${i}]`));
      }
    } else if (type === 'flashcards') {
      if (!Array.isArray(b.cards) || b.cards.length === 0) {
        errors.push(`${path}.cards: need at least one flashcard.`);
      } else {
        b.cards.forEach((card, ci) => {
          if (!isObject(card)) errors.push(`${path}.cards[${ci}]: must be an object.`);
          else {
            if (!isNonEmptyString(card.front)) errors.push(`${path}.cards[${ci}].front: required text.`);
            if (!isNonEmptyString(card.back)) errors.push(`${path}.cards[${ci}].back: required text.`);
          }
        });
      }
    } else if (PLANNED_BLOCK_TYPES.includes(type)) {
      warnings.push(`${path}: block type "${type}" is not supported yet and will show as a placeholder.`);
    } else {
      warnings.push(`${path}: unknown block type "${type}" will show as a placeholder.`);
    }
  }

  /** A glossary is optional; a broken entry is reported but never blocks the course. */
  function checkGlossary(value: unknown, path: string) {
    if (value === undefined) return;
    if (!Array.isArray(value)) {
      warnings.push(`${path}: must be a list of { term, definition }; it is ignored.`);
      return;
    }
    value.forEach((entry, i) => {
      if (!isObject(entry) || !isNonEmptyString(entry.term) || !isNonEmptyString(entry.definition)) {
        warnings.push(`${path}[${i}]: needs "term" and "definition" text; it is ignored.`);
      }
    });
  }
  checkGlossary(course.glossary, 'glossary');

  (course.modules as unknown[]).forEach((m, mi) => {
    const mp = `modules[${mi}]`;
    if (!isObject(m)) {
      errors.push(`${mp}: must be an object.`);
      return;
    }
    if (!isNonEmptyString(m.id)) errors.push(`${mp}.id: required.`);
    else unique('module', m.id, `${mp}.id`);
    if (!isNonEmptyString(m.title)) errors.push(`${mp}.title: required text.`);
    checkGlossary(m.glossary, `${mp}.glossary`);
    if (!Array.isArray(m.lessons)) {
      errors.push(`${mp}.lessons: must be a list.`);
      return;
    }
    m.lessons.forEach((l, li) => {
      const lp = `${mp}.lessons[${li}]`;
      if (!isObject(l)) {
        errors.push(`${lp}: must be an object.`);
        return;
      }
      if (!isNonEmptyString(l.id)) errors.push(`${lp}.id: required.`);
      else unique('lesson', l.id, `${lp}.id`);
      if (!isNonEmptyString(l.title)) errors.push(`${lp}.title: required text.`);
      if (l.blocks === undefined) l.blocks = [];
      if (!Array.isArray(l.blocks)) {
        errors.push(`${lp}.blocks: must be a list.`);
        return;
      }
      l.blocks.forEach((b, bi) => checkBlock(b, `${lp}.blocks[${bi}]`));
    });
    if (m.test !== undefined) {
      checkBlock(m.test, `${mp}.test`);
      if (isObject(m.test) && m.test.type !== 'module-test') {
        errors.push(`${mp}.test.type: must be "module-test".`);
      }
    }
  });

  if (course.finalExam !== undefined) {
    checkBlock(course.finalExam, 'finalExam');
    if (isObject(course.finalExam) && course.finalExam.type !== 'final-exam') {
      errors.push('finalExam.type: must be "final-exam".');
    }
  }

  if (errors.length > 0) return { ok: false, errors, warnings };
  return { ok: true, errors, warnings, course: course as unknown as Course };
}
