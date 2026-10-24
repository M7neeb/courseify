import type { Backup, Block, ChessRecord, Course, CourseMastery, Module, Question, SavedGame, TrashedCourse } from './types.ts';
import { replaceQuestions } from './reports.ts';
import { migrateBackup, migrateCourse } from './migrations.ts';
import { mergeSettings } from './settings.ts';
import { normalizeProgress } from './progress.ts';
import { mergeModule } from './course-utils.ts';
import { validateCourse, type ValidationResult } from './validate.ts';

export type ImportAnalysis =
  | { kind: 'course'; course: Course; warnings: string[] }
  | { kind: 'module'; module: Module; courseId?: string; warnings: string[] }
  | { kind: 'exam'; exam: Block; courseId?: string; warnings: string[] }
  | { kind: 'questions'; questions: Question[]; courseId?: string; warnings: string[] }
  | { kind: 'backup'; backup: Backup; warnings: string[] }
  | { kind: 'error'; errors: string[] };

type Parsed = { ok: true; value: unknown } | { ok: false; error: string };

/** Answers often come wrapped in ```json fences or with a sentence around them. Be forgiving. */
export function parseLooseJson(text: string): Parsed {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Nothing to import: the text is empty.' };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (firstError) {
    const unfenced = trimmed.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '');
    try {
      return { ok: true, value: JSON.parse(unfenced) };
    } catch {
      const start = unfenced.indexOf('{');
      const end = unfenced.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return { ok: true, value: JSON.parse(unfenced.slice(start, end + 1)) };
        } catch {
          /* fall through to the original error */
        }
      }
      const message = firstError instanceof Error ? firstError.message : String(firstError);
      return { ok: false, error: `This is not valid JSON: ${message}` };
    }
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function analyzeImport(text: string): ImportAnalysis {
  const parsed = parseLooseJson(text);
  if (!parsed.ok) return { kind: 'error', errors: [parsed.error] };
  const value = parsed.value;
  if (!isObject(value)) return { kind: 'error', errors: ['The file must contain one JSON object.'] };

  if (value.kind === 'course-app-backup') return analyzeBackup(value);

  // The prompt builder asks for {"courseId": "...", "module": {...}} so the right course is preselected.
  const courseId = typeof value.courseId === 'string' && value.courseId.trim() !== '' ? value.courseId : undefined;

  if (isObject(value.module) && value.modules === undefined) {
    const check = validateCourse({ schemaVersion: 1, id: 'module-check', title: 'module-check', modules: [value.module] });
    if (!check.ok || !check.course) return { kind: 'error', errors: check.errors };
    return { kind: 'module', module: check.course.modules[0] as Module, courseId, warnings: check.warnings };
  }

  // Corrected questions from the "fix reported questions" prompt: {"courseId", "questions": [...]}.
  if (Array.isArray(value.questions) && value.modules === undefined && value.module === undefined && value.finalExam === undefined) {
    const check = validateCourse({ schemaVersion: 2, id: 'questions-check', title: 'questions-check', modules: [{ id: 'm', title: 'm', lessons: [{ id: 'l', title: 'l', blocks: [{ id: 'b', type: 'quiz', questions: value.questions }] }] }] });
    if (!check.ok || !check.course) return { kind: 'error', errors: check.errors };
    const questions = (check.course.modules[0]?.lessons[0]?.blocks[0]?.questions ?? []) as Question[];
    return { kind: 'questions', questions, courseId, warnings: check.warnings };
  }

  if (isObject(value.finalExam) && value.modules === undefined) {
    const check = validateCourse({ schemaVersion: 1, id: 'exam-check', title: 'exam-check', modules: [], finalExam: value.finalExam });
    if (!check.ok || !check.course?.finalExam) return { kind: 'error', errors: check.errors };
    return { kind: 'exam', exam: check.course.finalExam, courseId, warnings: check.warnings };
  }

  const migrated = migrateCourse(value);
  if (migrated.error) return { kind: 'error', errors: [migrated.error] };
  const result = validateCourse(migrated.data);
  if (!result.ok || !result.course) return { kind: 'error', errors: result.errors };
  return { kind: 'course', course: result.course, warnings: result.warnings };
}

function analyzeBackup(value: Record<string, unknown>): ImportAnalysis {
  const migrated = migrateBackup(value);
  if (migrated.error) return { kind: 'error', errors: [migrated.error] };
  const b = migrated.data as Record<string, unknown>;
  if (!Array.isArray(b.courses)) return { kind: 'error', errors: ['Backup: "courses" must be a list.'] };
  const errors: string[] = [];
  const courses: Course[] = [];
  b.courses.forEach((c, i) => {
    const r = validateCourse(c);
    if (r.ok && r.course) courses.push(r.course);
    else errors.push(...r.errors.map((e) => `Backup course ${i + 1}: ${e}`));
  });
  if (errors.length > 0) return { kind: 'error', errors };
  const progress = (Array.isArray(b.progress) ? b.progress : []).map(normalizeProgress).filter((p) => p !== null);
  const courseMeta = (Array.isArray(b.courseMeta) ? b.courseMeta : []).filter(
    (m): m is Backup['courseMeta'][number] => isObject(m) && typeof m.courseId === 'string'
  );
  // Trashed courses are optional and leniently checked: keep the ones we can recognise.
  const trash = (Array.isArray(b.trash) ? b.trash : []).filter(
    (t): t is TrashedCourse => isObject(t) && typeof t.courseId === 'string' && isObject(t.course)
  );
  // Mastery is optional too: keep records that carry a course id and a skills map.
  const mastery = (Array.isArray(b.mastery) ? b.mastery : []).filter(
    (m): m is CourseMastery => isObject(m) && typeof m.courseId === 'string' && isObject(m.skills) && Array.isArray(m.mistakes)
  );
  // Day-by-day activity (streak and XP): keep days that carry their date.
  const activity = (Array.isArray(b.activity) ? b.activity : []).filter(
    (a): a is NonNullable<Backup['activity']>[number] => isObject(a) && typeof a.day === 'string'
  );
  // Chess games: keep the ones with an id, a start position and a move list.
  const games = (Array.isArray(b.games) ? b.games : []).filter(
    (g): g is SavedGame => isObject(g) && typeof g.id === 'string' && typeof g.startFen === 'string' && Array.isArray(g.moves) && typeof g.botId === 'string'
  );
  const chess: ChessRecord | undefined =
    isObject(b.chess) && isObject(b.chess.endgames)
      ? {
          endgames: b.chess.endgames as ChessRecord['endgames'],
          ...(isObject(b.chess.rating) && typeof b.chess.rating.value === 'number' ? { rating: b.chess.rating as ChessRecord['rating'] } : {})
        }
      : undefined;
  const backup: Backup = {
    kind: 'course-app-backup',
    schemaVersion: typeof b.schemaVersion === 'number' ? b.schemaVersion : 1,
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : new Date().toISOString(),
    courses,
    progress,
    courseMeta,
    settings: mergeSettings(b.settings),
    mastery,
    activity,
    trash,
    games,
    ...(chess ? { chess } : {})
  };
  return { kind: 'backup', backup, warnings: [] };
}

/** Puts corrected questions into a course over the ones with the same id, and re-validates it. */
export function applyQuestions(course: Course, questions: Question[]): ValidationResult {
  const { course: next, missing } = replaceQuestions(course, questions);
  if (missing.length > 0) return { ok: false, errors: missing.map((id) => `questions: no question with the id "${id}" in this course.`), warnings: [] };
  return validateCourse(next);
}

/** Puts a final exam into a course (replacing any old one) and re-validates the whole result. */
export function applyFinalExam(course: Course, exam: Block): ValidationResult {
  return validateCourse({ ...structuredClone(course), finalExam: exam });
}

/** Puts a module into a course and re-validates the whole result (catches clashing ids). */
export function applyModule(course: Course, mod: Module): ValidationResult {
  return validateCourse(mergeModule(course, mod));
}
