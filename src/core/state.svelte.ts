// App-wide reactive state (Svelte 5 runes). Screens read `app` and call the functions below;
// only these functions write to storage.

import { storage } from './storage.ts';
import { defaultSettings, patchOverrides, settingsFor } from './settings.ts';
import { formatHash, parseHash } from './router.ts';
import { flattenCourse } from './course-utils.ts';
import { newProgress, pruneProgress } from './progress.ts';
import { dayKey, emptyDay, withActivity, type ActivityDay } from './activity.ts';
import { applyReview } from './exercise.ts';
import { applyCard } from './srs.ts';
import { makeTrashed, purgeExpired } from './trash.ts';
import { CATALOG } from './catalog.ts';
import { validateCourse } from './validate.ts';
import {
  MASTERY,
  applyOutcome,
  courseSkills,
  emptyCourseMastery,
  emptySkillMastery,
  itemForSkill,
  moduleMasteryPercent,
  skillIndex
} from './mastery.ts';
import type {
  Backup,
  Course,
  CourseMastery,
  CourseMeta,
  CourseProgress,
  MasteryAttempt,
  MistakeLogEntry,
  Reflection,
  Route,
  Settings,
  CourseSettingKey,
  SkillMastery,
  TrashedCourse
} from './types.ts';

/** A short-lived message; `actionLabel`/`onAction` add an optional undo-style button. */
export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const app = $state({
  ready: false,
  route: parseHash(typeof location !== 'undefined' ? location.hash : '') as Route,
  focusMode: false,
  settings: defaultSettings() as Settings,
  courses: [] as Course[],
  progress: {} as Record<string, CourseProgress>,
  meta: {} as Record<string, CourseMeta>,
  mastery: {} as Record<string, CourseMastery>,
  activity: {} as Record<string, ActivityDay>,
  trash: {} as Record<string, TrashedCourse>,
  toast: null as Toast | null,
  persisted: false
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastSeq = 0;

export function showToast(message: string, options: { actionLabel?: string; onAction?: () => void } = {}): void {
  const id = ++toastSeq;
  app.toast = { id, message, actionLabel: options.actionLabel, onAction: options.onAction };
  clearTimeout(toastTimer);
  // Give the user longer when there is something to click.
  toastTimer = setTimeout(() => {
    if (app.toast?.id === id) app.toast = null;
  }, options.actionLabel ? 7000 : 3500);
}

export function dismissToast(): void {
  clearTimeout(toastTimer);
  app.toast = null;
}

/** Runs the toast's action (for example "Undo") and clears the toast. */
export function runToastAction(): void {
  const current = app.toast;
  dismissToast();
  current?.onAction?.();
}

export function navigate(route: Route): void {
  if (route.name !== 'player') app.focusMode = false;
  const hash = formatHash(route);
  if (location.hash === hash) app.route = route;
  else location.hash = hash;
}

export async function initApp(): Promise<void> {
  window.addEventListener('hashchange', () => {
    app.route = parseHash(location.hash);
  });
  try {
    await loadAll();
    // Drop anything that has sat in the trash past the grace period.
    await purgeTrash();
    await installCatalog();
  } catch {
    // Storage can be blocked (for example in some private browsing modes). The app still opens, empty.
    showToast('Could not open local storage. Courses and progress will not be saved.');
  }
  app.ready = true;
  app.persisted = await storage.requestPersistence();
}

// Catalog courses already put in the library once. A course the learner removes is not put back.
const CATALOG_SEEN_KEY = 'course-app:catalogSeen';

function catalogSeen(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CATALOG_SEEN_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Puts every course that comes with the app into the library the first time the app sees it. */
async function installCatalog(): Promise<void> {
  const seen = catalogSeen();
  const before = seen.length;
  for (const entry of CATALOG) {
    if (seen.includes(entry.id)) continue;
    if (!app.courses.some((c) => c.id === entry.id) && !app.trash[entry.id]) {
      try {
        const result = validateCourse(await entry.load());
        if (!result.ok || !result.course) continue;
        await saveCourse(result.course);
      } catch {
        // Offline before the course was ever cached: try again on the next start.
        continue;
      }
    }
    seen.push(entry.id);
  }
  if (seen.length === before) return;
  try {
    localStorage.setItem(CATALOG_SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Storage blocked: the courses are installed; at worst a removed one comes back once.
  }
}

async function loadAll(): Promise<void> {
  const [settings, courses, progress, meta, activity, trash, mastery] = await Promise.all([
    storage.getSettings(),
    storage.listCourses(),
    storage.listProgress(),
    storage.listMeta(),
    storage.listActivity(),
    storage.listTrash(),
    storage.listMastery()
  ]);
  app.settings = settings;
  app.courses = courses;
  app.progress = Object.fromEntries(progress.map((p) => [p.courseId, p]));
  app.meta = Object.fromEntries(meta.map((m) => [m.courseId, m]));
  app.activity = Object.fromEntries(activity.map((a) => [a.day, a]));
  app.trash = Object.fromEntries(trash.map((t) => [t.courseId, t]));
  app.mastery = Object.fromEntries(mastery.map((m) => [m.courseId, m]));
}

export function getCourse(id: string): Course | undefined {
  return app.courses.find((c) => c.id === id);
}

export function displayTitle(course: Course): string {
  return app.meta[course.id]?.customTitle || course.title;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  app.settings = { ...app.settings, ...patch };
  await storage.saveSettings($state.snapshot(app.settings) as Settings);
}

/** The settings that apply inside a course: app settings plus the course's own choices. */
export function courseSettings(courseId: string | null | undefined): Settings {
  return settingsFor(app.settings, courseId);
}

/** Changes a course's own settings; a `null` value makes that setting follow the app again. */
export async function updateCourseSettings(courseId: string, patch: Partial<Record<CourseSettingKey, unknown>>): Promise<void> {
  const next = patchOverrides(app.settings.courseOverrides?.[courseId], patch);
  const all = { ...(app.settings.courseOverrides ?? {}) };
  if (Object.keys(next).length > 0) all[courseId] = next;
  else delete all[courseId];
  await updateSettings({ courseOverrides: all });
}

/** Removes every course-specific setting of a course. */
export async function resetCourseSettings(courseId: string): Promise<void> {
  const all = { ...(app.settings.courseOverrides ?? {}) };
  delete all[courseId];
  await updateSettings({ courseOverrides: all });
}

/** Saves a course. If it already exists its content is replaced and progress is kept. */
export async function saveCourse(course: Course): Promise<void> {
  await storage.saveCourse(course);
  const idx = app.courses.findIndex((c) => c.id === course.id);
  if (idx >= 0) app.courses[idx] = course;
  else app.courses.push(course);
  const existing = app.progress[course.id];
  if (existing) {
    const ids = flattenCourse(course).map((i) => i.id);
    const pruned = pruneProgress(course, $state.snapshot(existing) as CourseProgress, ids);
    app.progress[course.id] = pruned;
    await storage.saveProgress(pruned);
  }
}

/** Moves a course to the trash (recoverable) instead of deleting it outright. */
export async function removeCourse(id: string): Promise<void> {
  const course = getCourse(id);
  if (!course) return;
  const item = makeTrashed(course, app.meta[id], app.progress[id], new Date(), app.mastery[id]);
  await storage.saveTrash($state.snapshot(item) as TrashedCourse);
  app.trash[id] = item;
  await storage.deleteCourse(id);
  app.courses = app.courses.filter((c) => c.id !== id);
  delete app.progress[id];
  delete app.meta[id];
}

/** Puts a trashed course back, with its meta and progress. */
export async function restoreCourse(id: string): Promise<boolean> {
  const item = app.trash[id];
  if (!item) return false;
  await storage.saveCourse($state.snapshot(item.course) as Course);
  if (item.meta) await storage.saveMeta($state.snapshot(item.meta) as CourseMeta);
  if (item.progress) await storage.saveProgress($state.snapshot(item.progress) as CourseProgress);
  if (item.mastery) await storage.saveMastery($state.snapshot(item.mastery) as CourseMastery);
  await storage.deleteTrash(id);
  delete app.trash[id];
  await loadAll();
  return true;
}

/** Removes trash items that are past the grace period. Returns what was purged. */
export async function purgeTrash(now: Date = new Date()): Promise<TrashedCourse[]> {
  const { purged } = purgeExpired(Object.values(app.trash), now);
  for (const item of purged) {
    await storage.deleteTrash(item.courseId);
    delete app.trash[item.courseId];
  }
  return purged;
}

async function updateMeta(courseId: string, patch: Partial<CourseMeta>): Promise<void> {
  const next: CourseMeta = { ...(app.meta[courseId] ?? { courseId }), ...patch, courseId };
  app.meta[courseId] = next;
  await storage.saveMeta($state.snapshot(next) as CourseMeta);
}

export function renameCourse(courseId: string, title: string): Promise<void> {
  return updateMeta(courseId, { customTitle: title.trim() || undefined });
}

/** Removes the report flags of questions that were fixed. */
export async function clearReports(courseId: string, questionIds: string[]): Promise<void> {
  if (!app.progress[courseId]?.reports) return;
  await updateProgress(courseId, (p) => {
    for (const id of questionIds) delete p.reports?.[id];
  });
}

/** The exam day for a course (YYYY-MM-DD), or empty to remove it. */
export function setExamDate(courseId: string, examDate: string): Promise<void> {
  return updateMeta(courseId, { examDate: /^\d{4}-\d{2}-\d{2}$/.test(examDate) ? examDate : undefined });
}

export function setArchived(courseId: string, archived: boolean): Promise<void> {
  return updateMeta(courseId, { archived });
}

export function setCourseTags(courseId: string, tags: string[]): Promise<void> {
  const clean = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  return updateMeta(courseId, { tags: clean });
}

export function getProgress(courseId: string): CourseProgress {
  return app.progress[courseId] ?? newProgress(courseId, getCourse(courseId)?.version ?? 1);
}

/** Change a course's progress in place, stamp it, and save it. */
export async function updateProgress(courseId: string, change: (p: CourseProgress) => void): Promise<void> {
  const p = app.progress[courseId] ?? newProgress(courseId, getCourse(courseId)?.version ?? 1);
  app.progress[courseId] = p;
  const live = app.progress[courseId] as CourseProgress;
  change(live);
  live.lastOpened = new Date().toISOString();
  await storage.saveProgress($state.snapshot(live) as CourseProgress);
}

/** Saves part of a lesson's or unit's reflection (brain dump, explanation). */
export function saveReflection(courseId: string, key: string, patch: Partial<Reflection>): Promise<void> {
  return updateProgress(courseId, (p) => {
    p.reflections ??= {};
    p.reflections[key] = { ...(p.reflections[key] ?? {}), ...patch };
  });
}

/** Records one correct answer (+10 XP) or one completed lesson (+5 XP) toward today's activity. */
export async function recordActivity(kind: 'correct' | 'lesson'): Promise<void> {
  const day = dayKey(new Date());
  const next = withActivity(app.activity[day] ?? emptyDay(day), kind);
  app.activity[day] = next;
  await storage.saveActivity($state.snapshot(next) as ActivityDay);
}

// ---------- Mastery ----------

/** Saved mastery for a course, or undefined when nothing has been practised yet. */
export function getMastery(courseId: string): CourseMastery | undefined {
  return app.mastery[courseId];
}

export function getSkillMastery(courseId: string, skillId: string): SkillMastery | undefined {
  return app.mastery[courseId]?.skills[skillId];
}

/** 0-100 mastery points over a whole module. */
export function moduleMasteryPercentFor(courseId: string, moduleId: string): number {
  const course = getCourse(courseId);
  if (!course) return 0;
  return moduleMasteryPercent(course, app.mastery[courseId], moduleId);
}

/**
 * Records one graded attempt: it moves the question's skill forward and appends the attempt to the
 * persistent mistake log. This is the only place mastery is written.
 */
export function recordMasteryAttempt(courseId: string, attempt: MasteryAttempt, now: Date = new Date()): void {
  const course = getCourse(courseId);
  if (!course) return;
  const skillId = skillIndex(course).get(attempt.questionId);
  if (!skillId) return;
  const skill = courseSkills(course).find((s) => s.id === skillId);
  const item = itemForSkill(course, skillId);

  const current = app.mastery[courseId] ?? emptyCourseMastery(courseId, now);
  const previous = current.skills[skillId] ?? emptySkillMastery(skillId, now);
  const nextSkill = applyOutcome(
    previous,
    {
      questionId: attempt.questionId,
      correct: attempt.correct,
      usedHint: attempt.usedHint,
      // A wrong answer only costs a tier inside a module test, the final exam or a course challenge.
      inTest: attempt.inTest ?? (item !== undefined && item.kind !== 'lesson'),
      totalQuestions: skill?.questionIds.length ?? 1,
      freshTry: attempt.freshTry
    },
    now
  );

  const entry: MistakeLogEntry = {
    questionId: attempt.questionId,
    skillId,
    moduleId: skill?.moduleId ?? null,
    given: attempt.given,
    correct: attempt.correct,
    at: now.toISOString(),
    ...(attempt.confidence ? { confidence: attempt.confidence } : {})
  };

  const record: CourseMastery = {
    ...current,
    skills: { ...current.skills, [skillId]: nextSkill },
    // Spaced re-review: a wrong answer schedules the question, a correct one clears it.
    reviews: applyReview(current.reviews, attempt.questionId, attempt.correct, now),
    // Spaced repetition for every answer: right answers come back later, wrong ones sooner.
    cards: applyCard(
      current.cards,
      attempt.questionId,
      skillId,
      { correct: attempt.correct, usedHint: attempt.usedHint, confidence: attempt.confidence },
      now,
      courseSettings(courseId).desiredRetention
    ),
    mistakes: [...current.mistakes, entry].slice(-MASTERY.mistakeLogLimit),
    updatedAt: now.toISOString()
  };
  app.mastery[courseId] = record;
  void storage.saveMastery($state.snapshot(record) as CourseMastery);
}

export async function exportBackup(): Promise<Backup> {
  return storage.exportBackup();
}export async function restoreBackup(backup: Backup): Promise<void> {
  await storage.importBackup(backup);
  await loadAll();
}
