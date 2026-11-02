// Pure helpers behind the Home screen: the rotating greeting, the week number of the streak, the
// skills-at-Familiar count, the resume-vs-start decision, the letter tiles and the module status
// line. No storage and no DOM, so every one of these is unit tested.

import type { Course, CourseMastery, CourseProgress, MasteryTier } from './types.ts';
import { TIER_ORDER, courseSkills, isMasterable, skillPoints, tierForPoints } from './mastery.ts';
import { testItemId } from './course-utils.ts';

/** Rotating greetings, shown when the streak has not yet reached a full week. */
export const GREETING_KEYS = ['home.greeting.momentum', 'home.greeting.back', 'home.greeting.focus'] as const;

/** A stable index from a day key: the greeting changes daily but never mid-render. */
export function greetingIndex(day: string, count: number): number {
  let hash = 0;
  for (let i = 0; i < day.length; i += 1) hash = (hash * 31 + day.charCodeAt(i)) >>> 0;
  return count > 0 ? hash % count : 0;
}

export interface Greeting {
  key: string;
  vars: Record<string, number>;
}

/** The week the current streak is on: days 1-7 are week 1, 8-14 week 2, and so on. */
export function streakWeeks(streak: number): number {
  return streak <= 0 ? 0 : Math.floor((streak - 1) / 7) + 1;
}

/**
 * The greeting line. A streak of a week or more always celebrates the week the learner is on;
 * otherwise the daily rotation picks one of the generic lines.
 */
export function greetingFor(day: string, streak: number): Greeting {
  if (streak >= 7) return { key: 'home.greeting.week', vars: { n: streakWeeks(streak) } };
  const index = greetingIndex(day, GREETING_KEYS.length);
  return { key: GREETING_KEYS[index] ?? GREETING_KEYS[0], vars: {} };
}

export interface SkillsProgress {
  /** Skills at Familiar or above. */
  done: number;
  /** Every masterable skill across the library. */
  total: number;
  /** done / total, rounded to a whole percent; 0 when there is nothing to master. */
  percent: number;
}

const FAMILIAR_INDEX = TIER_ORDER.indexOf('familiar');

/** How many skills sit at Familiar or above, out of every masterable skill in the library. */
export function skillsProgress(
  courses: Course[],
  mastery: Record<string, CourseMastery | undefined>
): SkillsProgress {
  let done = 0;
  let total = 0;
  for (const course of courses) {
    const record = mastery[course.id];
    for (const skill of courseSkills(course)) {
      if (!isMasterable(skill)) continue;
      total += 1;
      if (TIER_ORDER.indexOf(tierForPoints(skillPoints(record, skill.id))) >= FAMILIAR_INDEX) done += 1;
    }
  }
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** The id of the course opened most recently, by its saved lastOpened stamp. */
export function mostRecentlyOpened(progress: Record<string, CourseProgress | undefined>): string | undefined {
  let bestId: string | undefined;
  let bestAt = '';
  for (const [courseId, record] of Object.entries(progress)) {
    const at = record?.lastOpened ?? '';
    if (at !== '' && at > bestAt) {
      bestAt = at;
      bestId = courseId;
    }
  }
  return bestId;
}

/** Run from a course: a course that has been opened before, or one with a saved progress record. */
export function hasBeenOpened(progress: Record<string, CourseProgress | undefined>, courseId: string): boolean {
  return progress[courseId] !== undefined;
}

export type CourseAction = 'resume' | 'start';

/** A course the learner has opened says Resume; one that has never been opened says Start. */
export function courseAction(courseId: string, progress: Record<string, CourseProgress | undefined>): CourseAction {
  return hasBeenOpened(progress, courseId) ? 'resume' : 'start';
}

/** How many course tiles the profile header shows before it collapses the rest into "+N". */
export const MAX_COURSE_ICONS = 6;

export interface CourseIconRow {
  shown: Course[];
  hidden: number;
}

/** The small course-tile row: the first `max` courses, and how many were left out. */
export function courseIconRow(courses: Course[], max: number = MAX_COURSE_ICONS): CourseIconRow {
  const shown = courses.slice(0, Math.max(0, Math.floor(max)));
  return { shown, hidden: Math.max(0, courses.length - shown.length) };
}

/** Subject colours (teal, green, blue, cyan, orange, red): the course circles pick from these. */
// One pen colour per course, so a course looks the same everywhere.
export const COURSE_ACCENTS = ['#2346b5', '#1f7a4d', '#b8322f', '#0f7480', '#6a46a8', '#a8551d'] as const;

/** A stable accent colour for a course, derived from its id so one course always looks the same. */
export function courseAccent(courseId: string): string {
  let hash = 0;
  for (let i = 0; i < courseId.length; i += 1) hash = (hash * 31 + courseId.charCodeAt(i)) >>> 0;
  return COURSE_ACCENTS[hash % COURSE_ACCENTS.length] as string;
}

/** Run from a single module row: Resume once anything has been earned in it, otherwise Start. */
export function moduleAction(percent: number): CourseAction {
  return percent > 0 ? 'resume' : 'start';
}

/** Skills at Mastered across the library. */
export function skillsMastered(courses: Course[], mastery: Record<string, CourseMastery | undefined>): number {
  let mastered = 0;
  for (const course of courses) {
    const record = mastery[course.id];
    for (const skill of courseSkills(course)) {
      if (!isMasterable(skill)) continue;
      if (tierForPoints(skillPoints(record, skill.id)) === 'mastered') mastered += 1;
    }
  }
  return mastered;
}

/** Courses whose every masterable skill is Mastered. A course with nothing to master never counts. */
export function coursesCompleted(courses: Course[], mastery: Record<string, CourseMastery | undefined>): number {
  let completed = 0;
  for (const course of courses) {
    const record = mastery[course.id];
    const skills = courseSkills(course).filter(isMasterable);
    if (skills.length === 0) continue;
    if (skills.every((skill) => tierForPoints(skillPoints(record, skill.id)) === 'mastered')) completed += 1;
  }
  return completed;
}

/** The badge tiles on Home, in display order. */
export type BadgeId = 'weeks' | 'level' | 'familiar' | 'mastered' | 'courses' | 'days';

export interface HomeBadge {
  /** Stable id; also the i18n key suffix (home.badge.<id>). */
  id: BadgeId;
  /** The number shown on the tile, always counted from real progress. */
  count: number;
}

export interface HomeBadgeInput {
  streak: number;
  level: number;
  activeDays: number;
  courses: Course[];
  mastery: Record<string, CourseMastery | undefined>;
}

/**
 * The badge strip. Every tile is derived from what the learner actually did - the week streak,
 * total XP level, skills at Familiar or above, skills Mastered, courses completed and active days.
 * Nothing here is random or hard-coded.
 */
export function homeBadges(input: HomeBadgeInput): HomeBadge[] {
  return [
    { id: 'weeks', count: streakWeeks(input.streak) },
    { id: 'level', count: input.level },
    { id: 'familiar', count: skillsProgress(input.courses, input.mastery).done },
    { id: 'mastered', count: skillsMastered(input.courses, input.mastery) },
    { id: 'courses', count: coursesCompleted(input.courses, input.mastery) },
    { id: 'days', count: input.activeDays }
  ];
}

export interface ModuleStatus {
  /** i18n key for the status line. */
  key: string;
  /** i18n key of the tier's name, when the status shows a percentage. */
  tierKey?: string;
  /** The module's mastery percent (0-100). */
  percent: number;
}

/**
 * The one-line status under a module row:
 * - nothing earned and no test to take  -> "Not started"
 * - nothing earned but the module has a test -> "Mastery available"
 * - anything earned -> "15% Familiar" (the tier name follows the percent)
 */
export function moduleStatus(percent: number, tier: MasteryTier, hasTest: boolean): ModuleStatus {
  if (percent <= 0) {
    return hasTest
      ? { key: 'home.module.masteryAvailable', percent }
      : { key: 'home.module.notStarted', percent };
  }
  // Any progress at all reads as at least Attempted, never "5% Not started".
  const shown = tier === 'not-started' ? 'attempted' : tier;
  return { key: 'home.module.percent', tierKey: 'mastery.tier.' + shown, percent };
}

export interface SubjectGroup {
  /** The course's `subject`, trimmed; '' collects the courses that have none. */
  subject: string;
  courses: Course[];
}

/**
 * Courses grouped by subject, the way the Explore menu groups courses under Math, Science…
 * Subjects sort alphabetically (in `locale`), courses keep their incoming order, and courses
 * without a subject come last in a group with subject ''.
 */
export function groupBySubject(courses: Course[], locale = 'en'): SubjectGroup[] {
  const groups = new Map<string, Course[]>();
  for (const course of courses) {
    const subject = (course.subject ?? '').trim();
    const list = groups.get(subject) ?? [];
    list.push(course);
    groups.set(subject, list);
  }
  return [...groups.entries()]
    .map(([subject, list]) => ({ subject, courses: list }))
    .sort((a, b) => {
      if (a.subject === '' || b.subject === '') return a.subject === '' ? 1 : -1;
      return a.subject.localeCompare(b.subject, locale);
    });
}

/**
 * The unit a course opens on: the one holding the learner's saved position (a lesson or that
 * unit's test), otherwise the first unit. Undefined for a course without units.
 */
export function entryModuleId(course: Course, progress: CourseProgress | undefined): string | undefined {
  const at = progress?.position?.lessonId;
  if (at) {
    const found = course.modules.find(
      (module) => module.lessons.some((lesson) => lesson.id === at) || testItemId(module.id) === at
    );
    if (found) return found.id;
  }
  return course.modules[0]?.id;
}
