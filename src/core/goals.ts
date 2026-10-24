// Goals and looking back: the exam date planner, the weekly report and milestones. Pure logic;
// the screens pass in what they read from the app state.

import { dayKey, lastDays, type ActivityDay } from './activity.ts';
import { courseSkills, skillPoints } from './mastery.ts';
import type { ExamFocus } from './srs.ts';
import type { Course, CourseMastery, CourseProgress } from './types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one calendar day (YYYY-MM-DD) to another; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy ?? 1970, (fm ?? 1) - 1, fd ?? 1);
  const b = Date.UTC(ty ?? 1970, (tm ?? 1) - 1, td ?? 1);
  return Math.round((b - a) / DAY_MS);
}

// ---------- exam date planner ----------

export interface ExamPlan {
  courseId: string;
  examDate: string;
  daysLeft: number;
  lessonsLeft: number;
  /** New lessons to do per day to finish with a day to spare for review. */
  lessonsPerDay: number;
  /**
   * learn: lessons still to do; review: every lesson done, revise and take mock exams;
   * last: the exam is tomorrow; today: the exam is today.
   */
  phase: 'learn' | 'review' | 'last' | 'today';
  /** 0-100: how ready the learner is, from lessons done and skill points. */
  readiness: number;
}

/** Lessons with content that are not finished yet. */
export function lessonsLeft(course: Course, progress: CourseProgress | undefined): number {
  const done = new Set(progress?.completedLessons ?? []);
  let left = 0;
  for (const m of course.modules) for (const l of m.lessons) if (l.blocks.length > 0 && !done.has(l.id)) left += 1;
  return left;
}

/** The plan for a course with an exam date, or null when there is none or it has passed. */
/** How ready a course is, 0-100: 40% lessons done, 60% average skill points (fading counted). */
export function readiness(course: Course, progress: CourseProgress | undefined, mastery: CourseMastery | undefined, now: Date = new Date()): number {
  let total = 0;
  for (const m of course.modules) for (const l of m.lessons) if (l.blocks.length > 0) total += 1;
  const lessonShare = total === 0 ? 0 : (total - lessonsLeft(course, progress)) / total;
  const skills = courseSkills(course);
  if (skills.length === 0) return Math.round(lessonShare * 100);
  const points = skills.reduce((sum, s) => sum + skillPoints(mastery, s.id, now), 0) / skills.length;
  return Math.round((0.4 * lessonShare + 0.6 * (points / 100)) * 100);
}

/** The plan for a course with an exam date, or null when there is none or it has passed. Re-computed every day, so missed days are spread over the days that are left. */
export function examPlan(
  course: Course,
  progress: CourseProgress | undefined,
  examDate: string | undefined,
  today: string,
  mastery?: CourseMastery
): ExamPlan | null {
  if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return null;
  const daysLeft = daysBetween(today, examDate);
  if (daysLeft < 0) return null;
  const left = lessonsLeft(course, progress);
  // Keep the last day before the exam free for review and a mock exam.
  const studyDays = Math.max(1, daysLeft - 1);
  const phase: ExamPlan['phase'] = daysLeft === 0 ? 'today' : daysLeft === 1 ? 'last' : left === 0 ? 'review' : 'learn';
  return {
    courseId: course.id,
    examDate,
    daysLeft,
    lessonsLeft: left,
    lessonsPerDay: left === 0 ? 0 : Math.ceil(left / studyDays),
    phase,
    readiness: readiness(course, progress, mastery)
  };
}

/** The courses whose exam date is still ahead, for ordering reviews: the nearest exam first. */
export function examFocus(courses: Course[], meta: Record<string, { examDate?: string } | undefined>, today: string): ExamFocus[] {
  const out: ExamFocus[] = [];
  for (const course of courses) {
    const date = meta[course.id]?.examDate;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const daysLeft = daysBetween(today, date);
    if (daysLeft >= 0) out.push({ courseId: course.id, daysLeft });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

// ---------- weekly report ----------

/** The Monday (YYYY-MM-DD) of the week a day belongs to. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return dayKey(date);
}

/** Skill points per course and skill at the start of a week, to see what grew since. */
export interface WeekSnapshot {
  week: string;
  points: Record<string, Record<string, number>>;
}

export interface WeekReport {
  week: string;
  xp: number;
  correct: number;
  lessons: number;
  activeDays: number;
  /** The day with the most XP, if any XP was earned. */
  bestDay?: { day: string; xp: number };
  /** XP for each day Monday to Sunday. */
  days: { day: string; xp: number }[];
  /** Skills whose points went up since the start of the week: course id, skill id, before, after. */
  stronger: { courseId: string; skillId: string; before: number; after: number }[];
}

export function weekReport(
  week: string,
  activity: Record<string, ActivityDay>,
  start: WeekSnapshot | undefined,
  now: Record<string, Record<string, number>>
): WeekReport {
  const sunday = (() => {
    const [y, m, d] = week.split('-').map(Number);
    const date = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 6, 12);
    return dayKey(date);
  })();
  const days = lastDays(sunday, 7).map((day) => ({ day, xp: activity[day]?.xp ?? 0 }));
  let xp = 0;
  let correct = 0;
  let lessons = 0;
  let activeDays = 0;
  for (const { day } of days) {
    const a = activity[day];
    if (!a) continue;
    xp += a.xp;
    correct += a.correct;
    lessons += a.lessons;
    if (a.xp > 0) activeDays += 1;
  }
  const best = days.reduce<{ day: string; xp: number } | undefined>((top, d) => (d.xp > (top?.xp ?? 0) ? d : top), undefined);
  const stronger: WeekReport['stronger'] = [];
  if (start && start.week === week) {
    for (const [courseId, skills] of Object.entries(now)) {
      for (const [skillId, after] of Object.entries(skills)) {
        const before = start.points[courseId]?.[skillId] ?? 0;
        if (after > before) stronger.push({ courseId, skillId, before, after });
      }
    }
    stronger.sort((a, b) => b.after - b.before - (a.after - a.before));
  }
  return { week, xp, correct, lessons, activeDays, bestDay: best, days, stronger };
}

// ---------- milestones ----------

export interface MilestoneInput {
  lessonsDone: number;
  skillsMastered: number;
  coursesDone: number;
  correctAnswers: number;
  bestStreak: number;
  reviewsDone: number;
  chessWins: number;
  /** Rating of the strongest bot beaten. */
  bestBotBeaten: number;
  endgamesSolved: number;
}

export interface Milestone {
  id: string;
  /** Which number it is measured on, and the target. */
  measure: keyof MilestoneInput;
  target: number;
  /** For the badge's look. */
  group: 'learn' | 'habit' | 'chess';
}

export const MILESTONES: readonly Milestone[] = [
  { id: 'first-lesson', measure: 'lessonsDone', target: 1, group: 'learn' },
  { id: 'lessons-10', measure: 'lessonsDone', target: 10, group: 'learn' },
  { id: 'lessons-50', measure: 'lessonsDone', target: 50, group: 'learn' },
  { id: 'first-mastered', measure: 'skillsMastered', target: 1, group: 'learn' },
  { id: 'mastered-10', measure: 'skillsMastered', target: 10, group: 'learn' },
  { id: 'course-done', measure: 'coursesDone', target: 1, group: 'learn' },
  { id: 'correct-100', measure: 'correctAnswers', target: 100, group: 'habit' },
  { id: 'correct-500', measure: 'correctAnswers', target: 500, group: 'habit' },
  { id: 'correct-1000', measure: 'correctAnswers', target: 1000, group: 'habit' },
  { id: 'reviews-100', measure: 'reviewsDone', target: 100, group: 'habit' },
  { id: 'streak-7', measure: 'bestStreak', target: 7, group: 'habit' },
  { id: 'streak-30', measure: 'bestStreak', target: 30, group: 'habit' },
  { id: 'chess-first-win', measure: 'chessWins', target: 1, group: 'chess' },
  { id: 'chess-beat-1000', measure: 'bestBotBeaten', target: 1000, group: 'chess' },
  { id: 'chess-beat-1600', measure: 'bestBotBeaten', target: 1600, group: 'chess' },
  { id: 'chess-endgames-5', measure: 'endgamesSolved', target: 5, group: 'chess' }
];

/** The longest run of consecutive days with activity. */
export function longestStreak(activity: Record<string, ActivityDay>): number {
  const days = Object.values(activity)
    .filter((d) => d.xp > 0 || d.correct > 0 || d.lessons > 0)
    .map((d) => d.day)
    .sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const day of days) {
    run = prev && daysBetween(prev, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

export interface MilestoneState {
  milestone: Milestone;
  value: number;
  earned: boolean;
  /** When it was first seen as earned. */
  at?: string;
}

/**
 * Every milestone with its progress. `seen` holds the dates milestones were first earned; any
 * newly earned one is returned in `fresh` so the caller can save its date and celebrate it.
 */
export function milestoneStates(input: MilestoneInput, seen: Record<string, string>, nowIso: string): { states: MilestoneState[]; fresh: string[] } {
  const fresh: string[] = [];
  const states = MILESTONES.map((m) => {
    const value = input[m.measure];
    const earned = value >= m.target;
    if (earned && !seen[m.id]) fresh.push(m.id);
    return { milestone: m, value, earned, at: earned ? (seen[m.id] ?? nowIso) : undefined };
  });
  return { states, fresh };
}
