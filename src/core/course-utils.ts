import { videoIdOf } from './youtube.ts';
import type { Block, Course, Lesson, Module } from './types.ts';

export type FlatKind = 'lesson' | 'test' | 'exam';

/** The player walks a flat, ordered list: lessons, then each module's test, then the final exam. */
export interface FlatItem {
  id: string;
  title: string;
  kind: FlatKind;
  moduleId: string | null;
  moduleTitle: string;
  goal?: string;
  blocks: Block[];
}

export const FINAL_EXAM_ITEM_ID = 'final-exam';

export function testItemId(moduleId: string): string {
  return `${moduleId}:test`;
}

export function flattenCourse(course: Course): FlatItem[] {
  const items: FlatItem[] = [];
  for (const m of course.modules) {
    for (const l of m.lessons) {
      items.push({ id: l.id, title: l.title, kind: 'lesson', moduleId: m.id, moduleTitle: m.title, goal: l.goal, blocks: l.blocks ?? [] });
    }
    if (m.test) {
      items.push({ id: testItemId(m.id), title: '', kind: 'test', moduleId: m.id, moduleTitle: m.title, blocks: [m.test] });
    }
  }
  if (course.finalExam) {
    items.push({ id: FINAL_EXAM_ITEM_ID, title: '', kind: 'exam', moduleId: null, moduleTitle: '', blocks: [course.finalExam] });
  }
  return items;
}

export function courseProgressPercent(course: Course, completed: string[]): number {
  const items = flattenCourse(course);
  if (items.length === 0) return 0;
  const done = new Set(completed);
  const n = items.filter((i) => done.has(i.id)).length;
  return Math.round((n / items.length) * 100);
}

export type LessonKind = 'video' | 'exercise' | 'article';

/**
 * A lesson's dominant type, for the item label on the unit page: a video when it has
 * a playable one, otherwise an exercise when it carries questions, otherwise a reading article.
 */
export function lessonKind(lesson: Lesson): LessonKind {
  const blocks = lesson.blocks ?? [];
  // Only a video with a real YouTube link is shown, so only that makes it a video lesson.
  if (blocks.some((b) => b.type === 'video' && videoIdOf(b.url) !== null)) return 'video';
  const types = new Set(blocks.map((b) => b.type));
  if (types.has('quiz')) return 'exercise';
  return 'article';
}

/** First item not yet completed, or undefined when everything is done. */
export function firstOpenItem(course: Course, completed: string[]): FlatItem | undefined {
  const done = new Set(completed);
  return flattenCourse(course).find((i) => !done.has(i.id));
}

/** Replaces the module with the same id, or appends it. Returns a new course. */
export function mergeModule(course: Course, mod: Module): Course {
  const copy = structuredClone(course);
  const idx = copy.modules.findIndex((m) => m.id === mod.id);
  if (idx >= 0) copy.modules[idx] = mod;
  else copy.modules.push(mod);
  return copy;
}

/** Compact outline used by the module prompt. */
export function outlineOf(course: Course): string {
  const outline = {
    schemaVersion: course.schemaVersion,
    id: course.id,
    title: course.title,
    subject: course.subject,
    level: course.level,
    modules: course.modules.map((m) => ({
      id: m.id,
      title: m.title,
      summary: m.summary,
      lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, goal: l.goal }))
    }))
  };
  return JSON.stringify(outline, null, 2);
}

/** True when `candidate` (a catalog version such as "1.2") is newer than the installed course's version. */
export function isNewerVersion(candidate: string | number | undefined, installed: string | number | undefined): boolean {
  const a = Number(candidate);
  const b = Number(installed ?? 0);
  if (!Number.isFinite(a)) return false;
  return a > (Number.isFinite(b) ? b : 0);
}
