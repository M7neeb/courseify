import type { Course, CourseProgress } from './types.ts';

export function newProgress(courseId: string, courseVersion = 1): CourseProgress {
  return {
    courseId,
    courseVersion,
    completedLessons: [],
    answers: {},
    videoOverrides: {},
    imageOverrides: {},
    lastOpened: new Date().toISOString()
  };
}

/** Accepts anything from a backup file and returns a safe progress record, or null if unusable. */
export function normalizeProgress(raw: unknown): CourseProgress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.courseId !== 'string' || r.courseId === '') return null;
  const p = newProgress(r.courseId, typeof r.courseVersion === 'number' ? r.courseVersion : 1);
  if (Array.isArray(r.completedLessons)) p.completedLessons = r.completedLessons.filter((x): x is string => typeof x === 'string');
  if (typeof r.answers === 'object' && r.answers !== null) p.answers = r.answers as CourseProgress['answers'];
  if (typeof r.videoOverrides === 'object' && r.videoOverrides !== null) {
    p.videoOverrides = r.videoOverrides as CourseProgress['videoOverrides'];
  }
  if (typeof r.imageOverrides === 'object' && r.imageOverrides !== null) {
    p.imageOverrides = r.imageOverrides as CourseProgress['imageOverrides'];
  }
  if (typeof r.notes === 'object' && r.notes !== null && !Array.isArray(r.notes)) {
    p.notes = Object.fromEntries(
      Object.entries(r.notes).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
  }
  if (typeof r.questionNotes === 'object' && r.questionNotes !== null && !Array.isArray(r.questionNotes)) {
    p.questionNotes = Object.fromEntries(
      Object.entries(r.questionNotes).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
  }
  if (typeof r.reflections === 'object' && r.reflections !== null && !Array.isArray(r.reflections)) {
    p.reflections = Object.fromEntries(
      Object.entries(r.reflections).filter(
        (entry): entry is [string, NonNullable<CourseProgress['reflections']>[string]] => typeof entry[1] === 'object' && entry[1] !== null
      )
    );
  }
  if (typeof r.reports === 'object' && r.reports !== null && !Array.isArray(r.reports)) {
    p.reports = Object.fromEntries(
      Object.entries(r.reports).filter(
        (entry): entry is [string, NonNullable<CourseProgress['reports']>[string]] =>
          typeof entry[1] === 'object' && entry[1] !== null && ['wrong', 'unclear', 'typo', 'other'].includes((entry[1] as { reason?: string }).reason ?? '')
      )
    );
  }
  if (Array.isArray(r.bookmarks)) p.bookmarks = [...new Set(r.bookmarks.filter((x): x is string => typeof x === 'string'))];
  if (typeof r.lastOpened === 'string') p.lastOpened = r.lastOpened;
  const pos = r.position as { lessonId?: unknown } | undefined;
  if (pos && typeof pos.lessonId === 'string') p.position = { lessonId: pos.lessonId };
  return p;
}

/** Drops completed ids that no longer exist after a course update (answers are kept: ids are stable). */
export function pruneProgress(course: Course, p: CourseProgress, validIds: string[]): CourseProgress {
  const valid = new Set(validIds);
  return {
    ...p,
    courseVersion: course.version ?? p.courseVersion,
    completedLessons: p.completedLessons.filter((id) => valid.has(id))
  };
}
