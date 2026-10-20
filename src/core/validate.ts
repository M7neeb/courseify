import type { Course, Question, QuestionKind } from './types.ts';
import { chessBlockErrors, chessQuestionErrors } from './chess.ts';

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
  'chess'
];
const QUIZ_TYPES = ['quiz', 'module-test', 'final-exam'];
/** Block types the player can render today. */
export const RENDERED_BLOCK_TYPES = ['text', 'callout', 'video', 'image', 'example', 'flashcards', ...QUIZ_TYPES];
/** Block types the schema reserves for later features; they validate but show a placeholder. */
export const PLANNED_BLOCK_TYPES = ['exercise', 'code'];

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

  (course.modules as unknown[]).forEach((m, mi) => {
    const mp = `modules[${mi}]`;
    if (!isObject(m)) {
      errors.push(`${mp}: must be an object.`);
      return;
    }
    if (!isNonEmptyString(m.id)) errors.push(`${mp}.id: required.`);
    else unique('module', m.id, `${mp}.id`);
    if (!isNonEmptyString(m.title)) errors.push(`${mp}.title: required text.`);
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
