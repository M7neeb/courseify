// The Progress page's numbers: mastery rolled up from skills to units, courses and subjects (like
// "Math -> Algebra 1 -> Unit 2"), plus the weakest skills worth practising next. Pure: a
// function of the content and the saved mastery records, so all of it is unit tested.
//
// A "skill" here is one lesson with questions, the same set the unit page measures, so a unit's
// percentage on this page always equals the "Unit mastery" shown on the unit page.

import { MASTERY, TIER_ORDER, courseSkills, isMasterable, skillPoints, tierForPoints, type Skill } from './mastery.ts';
import { groupBySubject } from './home.ts';
import type { Course, CourseMastery, MasteryTier } from './types.ts';

export type TierCounts = Record<MasteryTier, number>;

export interface MasterySummary {
  /** How many measured skills sit in each tier. */
  counts: TierCounts;
  /** Measured skills (lessons that have questions). */
  total: number;
  /** Earned / maximum mastery points, 0-100. 0 when there is nothing to measure. */
  percent: number;
  /** Earned mastery points. */
  points: number;
  /** Maximum mastery points (100 per skill). */
  maxPoints: number;
}

export interface UnitProgress {
  moduleId: string;
  title: string;
  summary: MasterySummary;
}

export interface CourseProgressView {
  course: Course;
  summary: MasterySummary;
  units: UnitProgress[];
}

export interface SubjectProgress {
  /** '' for courses without a subject. */
  subject: string;
  summary: MasterySummary;
  courses: CourseProgressView[];
}

export interface FocusSkill {
  courseId: string;
  skillId: string;
  title: string;
  points: number;
  tier: MasteryTier;
}

function emptyCounts(): TierCounts {
  return { 'not-started': 0, attempted: 0, familiar: 0, proficient: 0, mastered: 0 };
}

/** The skills mastery is measured over: lessons with at least one question. */
export function measuredSkills(course: Course): Skill[] {
  return courseSkills(course).filter(isMasterable);
}

/** Tier counts and the points percentage over a list of (skill, points) pairs. */
export function summarize(points: number[]): MasterySummary {
  const counts = emptyCounts();
  let earned = 0;
  for (const value of points) {
    const clamped = Math.max(0, Math.min(MASTERY.points.mastered, value));
    counts[tierForPoints(clamped)] += 1;
    earned += clamped;
  }
  const maxPoints = points.length * MASTERY.points.mastered;
  return {
    counts,
    total: points.length,
    percent: maxPoints === 0 ? 0 : Math.round((earned / maxPoints) * 100),
    points: earned,
    maxPoints
  };
}

/** Adds summaries together (a course from its units, a subject from its courses). */
export function combine(summaries: MasterySummary[]): MasterySummary {
  const counts = emptyCounts();
  let points = 0;
  let maxPoints = 0;
  let total = 0;
  for (const s of summaries) {
    for (const tier of TIER_ORDER) counts[tier] += s.counts[tier];
    points += s.points;
    maxPoints += s.maxPoints;
    total += s.total;
  }
  return { counts, total, points, maxPoints, percent: maxPoints === 0 ? 0 : Math.round((points / maxPoints) * 100) };
}

export function courseProgress(course: Course, mastery: CourseMastery | undefined): CourseProgressView {
  const skills = measuredSkills(course);
  const units = course.modules.map((module) => ({
    moduleId: module.id,
    title: module.title,
    summary: summarize(skills.filter((s) => s.moduleId === module.id).map((s) => skillPoints(mastery, s.id)))
  }));
  return { course, units, summary: combine(units.map((u) => u.summary)) };
}

/** Subjects -> courses -> units, each with its mastery summary. Subject-less courses come last. */
export function progressBySubject(
  courses: Course[],
  mastery: Record<string, CourseMastery | undefined>,
  locale = 'en'
): SubjectProgress[] {
  return groupBySubject(courses, locale).map((group) => {
    const views = group.courses.map((course) => courseProgress(course, mastery[course.id]));
    return { subject: group.subject, courses: views, summary: combine(views.map((v) => v.summary)) };
  });
}

/**
 * Skills to practise next: started but below Proficient, weakest first. Never-started skills are
 * left out (they belong to "continue the course", not "fix what's shaky").
 */
export function focusSkills(
  courses: Course[],
  mastery: Record<string, CourseMastery | undefined>,
  limit = 5
): FocusSkill[] {
  const out: FocusSkill[] = [];
  for (const course of courses) {
    for (const skill of measuredSkills(course)) {
      const points = skillPoints(mastery[course.id], skill.id);
      if (points <= 0 || points >= MASTERY.points.proficient) continue;
      out.push({ courseId: course.id, skillId: skill.id, title: skill.title ?? skill.id, points, tier: tierForPoints(points) });
    }
  }
  return out.sort((a, b) => a.points - b.points || a.title.localeCompare(b.title)).slice(0, Math.max(0, limit));
}

/** Widths for a segmented tier bar, highest tier first, in whole percent that add up to 100. */
export function tierSegments(summary: MasterySummary): { tier: MasteryTier; count: number; percent: number }[] {
  const order = [...TIER_ORDER].reverse();
  if (summary.total === 0) return order.map((tier) => ({ tier, count: 0, percent: tier === 'not-started' ? 100 : 0 }));
  let used = 0;
  return order.map((tier, index) => {
    const count = summary.counts[tier];
    const percent = index === order.length - 1 ? 100 - used : Math.floor((count / summary.total) * 100);
    used += percent;
    return { tier, count, percent };
  });
}
