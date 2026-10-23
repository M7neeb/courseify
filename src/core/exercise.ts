// Exercise engine: one practice set for one skill. Pure logic - it reads the course content and a
// saved mastery record and returns the questions to ask. Nothing here touches storage or the DOM,
// so every selection rule is directly testable.
//
// A skill is the set of questions belonging to one lesson (see mastery.ts). A question may name its
// own skill with `skillId`; otherwise it belongs to the lesson it lives in.

import { courseSkills } from './mastery.ts';
import { indexQuestions } from './mistakes.ts';
import { isCardDue } from './srs.ts';
import type { Course, CourseMastery, Question, QuestionReview } from './types.ts';

export interface ExerciseConfig {
  /** How many questions a set holds when the caller does not ask for a number. */
  defaultSize: number;
  /** A set is never smaller than this (unless the skill has even fewer questions). */
  minSize: number;
  /** A set is never larger than this. */
  maxSize: number;
  /**
   * Days until the next review, indexed by the number of consecutive misses. The first miss waits
   * one day, the next three, then seven; the last value is the cap.
   */
  reviewDays: number[];
}

export const EXERCISE: ExerciseConfig = {
  defaultSize: 5,
  minSize: 3,
  maxSize: 10,
  reviewDays: [1, 3, 7]
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Why a question ended up in a set. `repeat` only appears when the pool is smaller than the set. */
export type ExerciseReason = 'review' | 'variant' | 'new' | 'seen' | 'repeat' | 'mixed';

export interface ExerciseSet {
  skillId: string;
  /** The questions to ask, in order. */
  questions: Question[];
  /** Why each question was chosen, aligned one-to-one with `questions`. */
  reasons: ExerciseReason[];
  /** How many questions the skill has in total. */
  poolSize: number;
  /** True when the pool was smaller than the requested size, so some questions repeat. */
  repeats: boolean;
  /** How many questions from earlier lessons were mixed in. */
  mixed?: number;
}

export interface ExerciseOptions {
  /** Questions wanted in the set; clamped to [minSize, maxSize]. */
  size?: number;
  /** Saved mastery, read for the review schedule and the first-try flags. */
  mastery?: CourseMastery;
  /** The moment the set is built; a question is due when its review time is at or before this. */
  now?: Date;
}

export function clampSetSize(size: number | undefined, config: ExerciseConfig = EXERCISE): number {
  const requested = typeof size === 'number' && Number.isFinite(size) ? Math.floor(size) : config.defaultSize;
  return Math.min(config.maxSize, Math.max(config.minSize, requested));
}

/** Deterministic 0..1 generator (mulberry32) so the same seed always builds the same set. */
function rng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

// ---------- spaced re-review ----------

/** The wait, in days, after `misses` consecutive wrong answers. */
export function reviewInterval(misses: number, days: number[] = EXERCISE.reviewDays): number {
  if (days.length === 0) return 0;
  const index = Math.min(Math.max(Math.floor(misses), 1), days.length) - 1;
  return days[index] ?? days[days.length - 1] ?? 0;
}

/** A wrong answer: record the miss and push the next review out by the interval for that count. */
export function scheduleMiss(
  previous: QuestionReview | undefined,
  questionId: string,
  now: Date = new Date(),
  days: number[] = EXERCISE.reviewDays
): QuestionReview {
  const misses = (previous?.misses ?? 0) + 1;
  const nextAt = new Date(now.getTime() + reviewInterval(misses, days) * DAY_MS);
  return { questionId, misses, nextAt: nextAt.toISOString() };
}

/** True when a scheduled question is due to be asked again. */
export function isDue(review: QuestionReview | undefined, now: Date = new Date()): boolean {
  if (!review) return false;
  const at = new Date(review.nextAt).getTime();
  return Number.isFinite(at) && at <= now.getTime();
}

/** Every question of one skill, in course order. Test questions that name the skill count too. */
export function skillQuestions(course: Course, skillId: string): Question[] {
  const skill = courseSkills(course).find((s) => s.id === skillId);
  if (!skill) return [];
  const index = indexQuestions(course);
  const out: Question[] = [];
  for (const questionId of skill.questionIds) {
    const question = index.get(questionId)?.question;
    if (question) out.push(question);
  }
  return out;
}

/**
 * Builds one exercise set for a skill.
 *
 * Priority: questions answered wrongly and due for review first, then questions never attempted,
 * then everything else. A question never appears twice in a set unless the pool is smaller than the
 * requested size, in which case the pool is cycled and `repeats` says so. A missed question that
 * names a `variantGroup` is swapped for a sibling from the same group when one is available.
 */
export function buildExerciseSet(
  course: Course,
  skillId: string,
  seed: number,
  options: ExerciseOptions = {}
): ExerciseSet {
  const now = options.now ?? new Date();
  const mastery = options.mastery;
  const size = clampSetSize(options.size);
  const pool = skillQuestions(course, skillId);

  const random = rng(seed);
  const order = shuffled(pool, random);

  const reviews = mastery?.reviews ?? {};
  const cards = mastery?.cards ?? {};
  const firstTry = mastery?.skills[skillId]?.firstTry ?? {};

  const due: Question[] = [];
  const fresh: Question[] = [];
  const seen: Question[] = [];
  for (const question of order) {
    if (isDue(reviews[question.id], now) || isCardDue(cards[question.id], now)) due.push(question);
    else if (firstTry[question.id] === undefined && reviews[question.id] === undefined && cards[question.id] === undefined) fresh.push(question);
    else seen.push(question);
  }

  const picked: { question: Question; reason: ExerciseReason }[] = [];
  const taken = new Set<string>();

  // 1) Due and missed. Prefer a different question with the same variantGroup.
  for (const question of due) {
    if (taken.has(question.id)) continue;
    let chosen = question;
    let reason: ExerciseReason = 'review';
    const group = question.variantGroup;
    if (typeof group === 'string' && group !== '') {
      const sibling = order.find((q) => q.id !== question.id && q.variantGroup === group && !taken.has(q.id));
      if (sibling) {
        chosen = sibling;
        reason = 'variant';
      }
    }
    picked.push({ question: chosen, reason });
    taken.add(chosen.id);
  }
  // 2) Never attempted.
  for (const question of fresh) {
    if (taken.has(question.id)) continue;
    picked.push({ question, reason: 'new' });
    taken.add(question.id);
  }
  // 3) Everything else.
  for (const question of seen) {
    if (taken.has(question.id)) continue;
    picked.push({ question, reason: 'seen' });
    taken.add(question.id);
  }

  const target = picked.slice(0, size);
  const result = [...target];
  const repeats = picked.length > 0 && picked.length < size;
  for (let i = 0; repeats && result.length < size; i += 1) {
    const base = picked[i % picked.length];
    if (!base) break;
    result.push({ question: base.question, reason: 'repeat' });
  }

  return {
    skillId,
    questions: result.map((entry) => entry.question),
    reasons: result.map((entry) => entry.reason),
    poolSize: pool.length,
    repeats
  };
}

/** Immutably record one graded answer in the review schedule: a miss reschedules, a hit clears. */
export function applyReview(
  reviews: Record<string, QuestionReview> | undefined,
  questionId: string,
  correct: boolean,
  now: Date = new Date()
): Record<string, QuestionReview> {
  const next = { ...(reviews ?? {}) };
  if (correct) delete next[questionId];
  else next[questionId] = scheduleMiss(next[questionId], questionId, now);
  return next;
}

// ---------- course challenge ----------

export interface ChallengeConfig {
  /** Questions taken from each skill. */
  perSkill: number;
  /** A challenge never holds more than this. */
  maxSize: number;
}

export const CHALLENGE: ChallengeConfig = { perSkill: 2, maxSize: 30 };

/**
 * A course challenge: a few questions from every lesson skill of the course, mixed together so
 * units are not practised one after another. Inside each skill, due and never-asked questions
 * come first. Skills are then interleaved round-robin and the final order is shuffled.
 */
export function buildChallengeSet(
  course: Course,
  seed: number,
  options: { mastery?: CourseMastery; now?: Date; perSkill?: number; maxSize?: number } = {}
): Question[] {
  const perSkill = Math.max(1, Math.floor(options.perSkill ?? CHALLENGE.perSkill));
  const maxSize = Math.max(1, Math.floor(options.maxSize ?? CHALLENGE.maxSize));
  const skills = courseSkills(course).filter((skill) => skill.lessonId !== null && skill.questionIds.length > 0);
  const random = rng(seed);
  const buckets = skills.map((skill, index) => {
    const set = buildExerciseSet(course, skill.id, seed + index * 7919, { mastery: options.mastery, now: options.now, size: perSkill });
    // buildExerciseSet pads small pools with repeats; a challenge never asks the same question twice.
    const unique: Question[] = [];
    for (const question of set.questions) if (!unique.some((q) => q.id === question.id)) unique.push(question);
    return unique.slice(0, perSkill);
  });
  const mixed: Question[] = [];
  for (let round = 0; round < perSkill; round += 1) {
    for (const bucket of shuffled(buckets, random)) {
      const question = bucket[round];
      if (question && !mixed.some((q) => q.id === question.id)) mixed.push(question);
    }
  }
  return shuffled(mixed, random).slice(0, maxSize);
}

// ---------- interleaving ----------

/**
 * Questions from EARLIER lessons to mix into a practice set, so practice is not one topic at a
 * time (mixed practice makes you choose the method yourself, which sticks better). Only questions
 * the learner has already answered are used - never something not taught yet. Due cards first,
 * then the ones most likely to be forgotten.
 */
export function interleaveExtras(
  course: Course,
  skillId: string,
  options: { mastery?: CourseMastery; now?: Date; count?: number; retrievabilityOf?: (questionId: string) => number } = {}
): Question[] {
  const count = Math.max(0, Math.floor(options.count ?? 2));
  if (count === 0) return [];
  const skills = courseSkills(course).filter((s) => s.lessonId !== null && s.questionIds.length > 0);
  const position = skills.findIndex((s) => s.id === skillId);
  if (position <= 0) return [];
  const earlier = new Set(skills.slice(0, position).flatMap((s) => s.questionIds));
  const cards = options.mastery?.cards ?? {};
  const now = options.now ?? new Date();
  const index = indexQuestions(course);
  const answered = [...earlier].filter((id) => cards[id] !== undefined && index.has(id));
  const strength = options.retrievabilityOf ?? (() => 1);
  answered.sort((a, b) => {
    const dueA = isCardDue(cards[a], now) ? 0 : 1;
    const dueB = isCardDue(cards[b], now) ? 0 : 1;
    return dueA - dueB || strength(a) - strength(b) || a.localeCompare(b);
  });
  return answered.slice(0, count).map((id) => index.get(id)!.question);
}

/** Puts extra questions into a set at spread-out positions, keeping the set's size. */
export function mixIntoSet(questions: Question[], extras: Question[]): Question[] {
  const unique = extras.filter((q) => !questions.some((existing) => existing.id === q.id));
  if (unique.length === 0) return questions;
  const base = questions.slice(0, Math.max(1, questions.length - unique.length));
  const out = [...base];
  unique.forEach((question, i) => {
    const at = Math.min(out.length, Math.round(((i + 1) * (out.length + 1)) / (unique.length + 1)));
    out.splice(at, 0, question);
  });
  return out;
}

// ---------- mock exam ----------

/** Lengths a mock exam can have. */
export const EXAM_SIZES = [10, 20, 30] as const;

/**
 * A mock exam: questions from every lesson of the course, spread evenly and shuffled, with no
 * regard to what was practised before, so the score says where you really stand. Warm-up
 * questions never appear.
 */
export function buildMockExam(course: Course, seed: number, size: number): Question[] {
  const skills = courseSkills(course).filter((skill) => skill.lessonId !== null && skill.questionIds.length > 0);
  if (skills.length === 0) return [];
  const perSkill = Math.max(1, Math.ceil(size / skills.length) + 1);
  return buildChallengeSet(course, seed, { perSkill, maxSize: size });
}

/** Minutes for a mock exam: written answers and chess puzzles take longer than a quick question. */
export function examMinutes(questions: readonly Question[]): number {
  let seconds = 0;
  for (const q of questions) seconds += q.kind === 'written' ? 240 : q.kind === 'chess' || q.kind === 'numeric' ? 120 : 75;
  return Math.max(5, Math.ceil(seconds / 60));
}
