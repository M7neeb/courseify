// Mastery: one currency (points) per skill, where a skill is the questions belonging to one
// lesson. A skill holds 0-100 points and its tier is DERIVED from those points - the tier is never
// stored on its own. Pure logic, no storage: everything here is a function of the content and the
// saved mastery records, which makes the whole system testable.

import { FINAL_EXAM_ITEM_ID, flattenCourse, testItemId, type FlatItem } from './course-utils.ts';
import { SRS, skillRetention } from './srs.ts';
import type { Block, Course, CourseMastery, MasteryTier, Question, SkillMastery } from './types.ts';

export interface MasteryConfig {
  /** The points that define each tier. */
  points: { notStarted: number; attempted: number; familiar: number; proficient: number; mastered: number };
  /** First-try accuracy (share of a skill's questions solved first try) needed for a tier. */
  accuracy: { familiar: number; proficient: number };
  /** Gating thresholds. Retune the whole course flow in this one place. */
  gate: { lesson: MasteryTier; test: MasteryTier; module: number; exam: MasteryTier };
  /** How many attempts one course keeps in its mistake log. */
  mistakeLogLimit: number;
}

export const MASTERY: MasteryConfig = {
  points: { notStarted: 0, attempted: 10, familiar: 50, proficient: 80, mastered: 100 },
  accuracy: { familiar: 0.7, proficient: 1 },
  gate: {
    /** Lesson N+1 opens when lesson N reaches this tier. */
    lesson: 'familiar',
    /** A module test opens when every lesson in the module reaches this tier. */
    test: 'familiar',
    /** The next module opens at this share of the current module's maximum points. */
    module: 0.8,
    /** The final exam opens when every lesson in the course reaches this tier. */
    exam: 'familiar'
  },
  mistakeLogLimit: 500
};

export const TIER_ORDER: MasteryTier[] = ['not-started', 'attempted', 'familiar', 'proficient', 'mastered'];

/** The tier that a number of mastery points represents. The single source of truth for tiers. */
export function tierForPoints(points: number): MasteryTier {
  if (points >= MASTERY.points.mastered) return 'mastered';
  if (points >= MASTERY.points.proficient) return 'proficient';
  if (points >= MASTERY.points.familiar) return 'familiar';
  if (points >= MASTERY.points.attempted) return 'attempted';
  return 'not-started';
}

/** The points that define a tier. */
export function pointsForTier(tier: MasteryTier): number {
  switch (tier) {
    case 'mastered':
      return MASTERY.points.mastered;
    case 'proficient':
      return MASTERY.points.proficient;
    case 'familiar':
      return MASTERY.points.familiar;
    case 'attempted':
      return MASTERY.points.attempted;
    default:
      return MASTERY.points.notStarted;
  }
}

/** One tier lower - but never below Familiar, because only a module test can cost a tier. */
export function tierBelow(tier: MasteryTier): MasteryTier {
  const index = Math.max(TIER_ORDER.indexOf('familiar'), TIER_ORDER.indexOf(tier) - 1);
  return TIER_ORDER[index] ?? 'familiar';
}

export function emptySkillMastery(skillId: string, now: Date = new Date()): SkillMastery {
  return {
    skillId,
    points: MASTERY.points.notStarted,
    firstTry: {},
    lastPracticedAt: now.toISOString(),
    timesMissed: 0,
    updatedAt: now.toISOString()
  };
}

export function emptyCourseMastery(courseId: string, now: Date = new Date()): CourseMastery {
  return { courseId, skills: {}, mistakes: [], updatedAt: now.toISOString() };
}

/** The points a skill has earned, as stored, without fading. */
export function storedPoints(mastery: CourseMastery | undefined, skillId: string): number {
  return mastery?.skills[skillId]?.points ?? MASTERY.points.notStarted;
}

/**
 * The points a skill counts for right now. Mastery fades: a Mastered skill whose questions are
 * being forgotten shows as Proficient until it is reviewed, and a right review brings it back.
 * Fading never goes below Proficient, so it can never close a lesson, test or unit that was open.
 */
export function skillPoints(mastery: CourseMastery | undefined, skillId: string, now: Date = new Date()): number {
  const points = storedPoints(mastery, skillId);
  if (points < MASTERY.points.mastered) return points;
  const retention = skillRetention(mastery, skillId, now);
  return retention !== undefined && retention < SRS.decayBelow ? MASTERY.points.proficient : points;
}

/** Share of a skill's questions solved on the first try. */
export function accuracyOf(state: SkillMastery | undefined, totalQuestions: number): number {
  if (!state) return 0;
  const total = Math.max(1, Math.floor(totalQuestions));
  const solved = Object.values(state.firstTry).filter(Boolean).length;
  return solved / total;
}

export interface MasteryOutcome {
  questionId: string;
  /** Was the answer correct? */
  correct: boolean;
  /** Was a hint (or the full solution) revealed before answering? */
  usedHint: boolean;
  /** True in a module test or the final exam, false in lesson practice. */
  inTest: boolean;
  /** How many questions the skill has in total, from the course content. */
  totalQuestions: number;
  /** The first answer to this question in this set, not a retry after a miss in the same set. */
  freshTry?: boolean;
}

/**
 * Moves one skill forward by one graded attempt.
 *
 * Practice only ever raises mastery. A wrong answer inside a module test costs a Proficient or
 * Mastered skill exactly one tier, never more and never below Familiar. A skill that is already
 * Proficient reaches Mastered by answering its whole skill correctly, first try, inside a test.
 */
export function applyOutcome(
  state: SkillMastery,
  outcome: MasteryOutcome,
  now: Date = new Date()
): SkillMastery {
  const previousTier = tierForPoints(state.points);
  const clean = outcome.correct && !outcome.usedHint;

  // A miss or a hint marks the question "not first try". It counts again once it is answered right,
  // without a hint, as the first answer in a later set; retrying straight after a miss never does.
  const firstTry = { ...state.firstTry };
  firstTry[outcome.questionId] = outcome.freshTry === true && clean ? true : (firstTry[outcome.questionId] ?? true) && clean;

  const total = Math.max(1, Math.floor(outcome.totalQuestions));
  const attempted = Object.keys(firstTry).length;
  const solved = Object.values(firstTry).filter(Boolean).length;
  const accuracy = solved / total;

  let points: number;
  if (attempted === 0) {
    points = MASTERY.points.notStarted;
  } else if (previousTier === 'proficient' || previousTier === 'mastered') {
    if (outcome.inTest && !outcome.correct) {
      // Exactly one tier down, floored at Familiar.
      points = pointsForTier(tierBelow(previousTier));
    } else if (outcome.inTest && accuracy >= MASTERY.accuracy.proficient) {
      // 100% first-try on the skill, inside a test: Proficient becomes Mastered.
      points = MASTERY.points.mastered;
    } else {
      // Practice never lowers a skill that has already reached Proficient.
      points = state.points;
    }
  } else {
    points = Math.max(state.points, practicePoints(accuracy, attempted > 0));
  }

  return {
    skillId: state.skillId,
    points,
    firstTry,
    lastPracticedAt: now.toISOString(),
    // A hint is not a miss; only a wrong answer counts.
    timesMissed: (state.timesMissed ?? 0) + (outcome.correct ? 0 : 1),
    updatedAt: now.toISOString()
  };
}

function practicePoints(accuracy: number, attempted: boolean): number {
  if (!attempted) return MASTERY.points.notStarted;
  if (accuracy >= MASTERY.accuracy.proficient) return MASTERY.points.proficient;
  if (accuracy >= MASTERY.accuracy.familiar) return MASTERY.points.familiar;
  return MASTERY.points.attempted;
}

// ---------- the skill catalog, derived from course content ----------

/** A skill is the questions belonging to one lesson (plus any test question that names it). */
export interface Skill {
  id: string;
  /** Module this skill belongs to, or null for a final-exam-only skill. */
  moduleId: string | null;
  /** Set when the skill is a lesson, in which case its id is the lesson id. */
  lessonId: string | null;
  title?: string;
  /** The player item the skill's questions live in. */
  itemId: string;
  questionIds: string[];
}

/** True for a guess-first warm-up quiz: it gives feedback but never counts for mastery or review. */
export function isPretest(block: Block | undefined): boolean {
  return block?.pretest === true;
}

function questionsOf(block: Block | undefined): Question[] {
  if (!block || isPretest(block)) return [];
  const raw = (block as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((q): q is Question => typeof q === 'object' && q !== null && typeof (q as Question).id === 'string' && (q as Question).id !== '');
}

/** Every skill in a course, in outline order. */
export function courseSkills(course: Course): Skill[] {
  const byId = new Map<string, Skill>();

  function ensure(id: string, moduleId: string | null, lessonId: string | null, itemId: string, title?: string): Skill {
    let skill = byId.get(id);
    if (!skill) {
      skill = { id, moduleId, lessonId, title, itemId, questionIds: [] };
      byId.set(id, skill);
    } else if (skill.title === undefined && title !== undefined) {
      skill.title = title;
    }
    return skill;
  }

  function add(block: Block | undefined, fallbackSkillId: string, moduleId: string | null, lessonId: string | null, itemId: string, title?: string): void {
    for (const question of questionsOf(block)) {
      const explicit = typeof question.skillId === 'string' && question.skillId.trim() !== '' ? question.skillId : undefined;
      const id = explicit ?? fallbackSkillId;
      const skill = ensure(id, moduleId, explicit ? null : lessonId, itemId, explicit ? undefined : title);
      if (!skill.questionIds.includes(question.id)) skill.questionIds.push(question.id);
    }
  }

  for (const module of course.modules ?? []) {
    for (const lesson of module.lessons ?? []) {
      ensure(lesson.id, module.id, lesson.id, lesson.id, lesson.title);
      for (const block of lesson.blocks ?? []) add(block, lesson.id, module.id, lesson.id, lesson.id, lesson.title);
    }
    if (module.test) add(module.test, testItemId(module.id), module.id, null, testItemId(module.id));
  }
  if (course.finalExam) add(course.finalExam, FINAL_EXAM_ITEM_ID, null, null, FINAL_EXAM_ITEM_ID);

  return [...byId.values()];
}

/** questionId -> skillId, for attributing an answer to its skill. */
export function skillIndex(course: Course): Map<string, string> {
  const map = new Map<string, string>();
  for (const skill of courseSkills(course)) {
    for (const questionId of skill.questionIds) if (!map.has(questionId)) map.set(questionId, skill.id);
  }
  return map;
}

export function questionSkillId(course: Course, questionId: string): string | undefined {
  return skillIndex(course).get(questionId);
}

export function moduleSkills(course: Course, moduleId: string): Skill[] {
  return courseSkills(course).filter((skill) => skill.moduleId === moduleId);
}

/** A skill that has no questions cannot be practised, so it never blocks progress. */
export function isMasterable(skill: Skill): boolean {
  return skill.questionIds.length > 0;
}

/**
 * The skills a module's mastery is measured over: one per lesson. A module test's own questions
 * only count when they name a lesson's skill, so the module maximum is always lessons x 100.
 */
export function moduleMasterySkills(course: Course, moduleId: string): Skill[] {
  return moduleSkills(course, moduleId).filter((skill) => skill.lessonId !== null && skill.questionIds.length > 0);
}

/** Earned / maximum mastery points over a module, 0-1. A module with nothing to master is 1. */
export function moduleMasteryRatio(course: Course, mastery: CourseMastery | undefined, moduleId: string): number {
  const skills = moduleMasterySkills(course, moduleId);
  if (skills.length === 0) return 1;
  const maximum = skills.length * MASTERY.points.mastered;
  const earned = skills.reduce((sum, skill) => sum + skillPoints(mastery, skill.id), 0);
  return earned / maximum;
}

export function moduleMasteryPercent(course: Course, mastery: CourseMastery | undefined, moduleId: string): number {
  return Math.round(moduleMasteryRatio(course, mastery, moduleId) * 100);
}

/** The mastery points a module's skills can collectively award (100 for every masterable lesson). */
export function moduleMasteryPool(course: Course, moduleId: string): number {
  return moduleMasterySkills(course, moduleId).length * MASTERY.points.mastered;
}

/**
 * How many of a skill's questions must be answered first try to reach Familiar, using the shared
 * Familiar accuracy rule. A skill with questions always needs at least one correct answer, so the
 * "Get N of M questions to level up" never reads "Get 0 of M".
 */
export function questionsToLevelUp(totalQuestions: number): number {
  const total = Math.max(0, Math.floor(totalQuestions));
  if (total === 0) return 0;
  return Math.max(1, Math.ceil(MASTERY.accuracy.familiar * total));
}

/** The player item a skill's questions live in, so a weak skill can be jumped to. */
export function itemForSkill(course: Course, skillId: string): FlatItem | undefined {
  const skill = courseSkills(course).find((s) => s.id === skillId);
  if (!skill) return undefined;
  return flattenCourse(course).find((item) => item.id === skill.itemId);
}

export function skillTitle(course: Course, skillId: string): string {
  const skill = courseSkills(course).find((s) => s.id === skillId);
  return skill?.title ?? skillId;
}
