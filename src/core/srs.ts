// Spaced repetition for every question, using FSRS (the scheduler modern Anki uses). Each answered
// question gets a review card: how well it is remembered (stability), how hard it is (difficulty)
// and when it is due again. Right answers push the next review further out, wrong answers bring it
// back soon. Pure logic, no storage: the cards live inside the course's mastery record.

import { fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';
import { dayKey } from './activity.ts';
import type { Confidence, Course, CourseMastery, ReviewCard } from './types.ts';

export interface SrsConfig {
  /** Share of cards the scheduler aims to have remembered on their due day. */
  retention: number;
  /** Reviews offered per day, so a break never turns into a pile of hundreds. */
  dailyLimit: number;
  /** A skill whose memory estimate drops below this gets a "Review soon" mark. */
  fadeBelow: number;
  /** A Mastered skill whose memory estimate drops below this shows as Proficient until reviewed. */
  decayBelow: number;
}

export const SRS: SrsConfig = {
  retention: 0.9,
  dailyLimit: 20,
  fadeBelow: 0.85,
  decayBelow: 0.7
};

// Day-sized steps only: lessons are not drilled again minutes later, they come back on later days.
// One scheduler per target retention (the learner can choose how much to remember).
const schedulers = new Map<number, ReturnType<typeof fsrs>>();
function schedulerFor(retention: number = SRS.retention) {
  const target = Math.min(0.97, Math.max(0.7, retention));
  let found = schedulers.get(target);
  if (!found) {
    found = fsrs(generatorParameters({ request_retention: target, enable_short_term: false, enable_fuzz: false }));
    schedulers.set(target, found);
  }
  return found;
}
const scheduler = schedulerFor();

/**
 * How an answer translates into a scheduler grade. Wrong is "Again". A right answer after a hint,
 * or one the learner marked as a guess or as unsure, is "Hard". A clean right answer is "Good".
 */
export function ratingFor(correct: boolean, usedHint: boolean, confidence?: Confidence): Grade {
  if (!correct) return Rating.Again;
  if (usedHint || confidence === 'guess' || confidence === 'unsure') return Rating.Hard;
  return Rating.Good;
}

function toCard(saved: ReviewCard | undefined, now: Date): Card {
  if (!saved) {
    return {
      due: now,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      learning_steps: 0,
      state: State.New
    };
  }
  return {
    due: new Date(saved.due),
    stability: saved.stability,
    difficulty: saved.difficulty,
    elapsed_days: 0,
    scheduled_days: saved.scheduledDays,
    reps: saved.reps,
    lapses: saved.lapses,
    learning_steps: 0,
    state: saved.state as State,
    last_review: saved.lastReview ? new Date(saved.lastReview) : undefined
  };
}

function fromCard(card: Card, questionId: string, skillId: string, confidentMiss: boolean): ReviewCard {
  const out: ReviewCard = {
    questionId,
    skillId,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review?.toISOString()
  };
  if (confidentMiss) out.confidentMiss = true;
  return out;
}

/** Records one answer on a question's card and returns the updated card. */
export function scheduleCard(
  previous: ReviewCard | undefined,
  questionId: string,
  skillId: string,
  answer: { correct: boolean; usedHint: boolean; confidence?: Confidence },
  now: Date = new Date(),
  retention: number = SRS.retention
): ReviewCard {
  const rating = ratingFor(answer.correct, answer.usedHint, answer.confidence);
  // One answer a day is what counts. A retry later the same day (the quiz lets you try again until
  // you are right) only changes the card when it is worse than the day's first answer, so a miss
  // followed by a correction still comes back tomorrow.
  if (previous?.lastReview && dayKey(new Date(previous.lastReview)) === dayKey(now)) {
    const earlier = previous.lastRating ?? Rating.Good;
    if (rating >= earlier) {
      return answer.correct ? previous : { ...previous, confidentMiss: previous.confidentMiss || answer.confidence === 'sure' || undefined };
    }
  }
  const next = schedulerFor(retention).next(toCard(previous, now), now, rating).card;
  // A mistake the learner was sure about is the most useful one to fix, so it is flagged until
  // the question is answered right again.
  const confidentMiss = !answer.correct && answer.confidence === 'sure' ? true : !answer.correct && previous?.confidentMiss === true;
  return { ...fromCard(next, questionId, skillId, confidentMiss), lastRating: rating };
}

/** Immutably records one answer in a course's card set. */
export function applyCard(
  cards: Record<string, ReviewCard> | undefined,
  questionId: string,
  skillId: string,
  answer: { correct: boolean; usedHint: boolean; confidence?: Confidence },
  now: Date = new Date(),
  retention: number = SRS.retention
): Record<string, ReviewCard> {
  return { ...(cards ?? {}), [questionId]: scheduleCard(cards?.[questionId], questionId, skillId, answer, now, retention) };
}

/** Chance (0-1) that the question is still remembered right now. */
export function retrievability(card: ReviewCard, now: Date = new Date()): number {
  if (card.reps === 0 || card.stability <= 0) return 0;
  const value = scheduler.get_retrievability(toCard(card, now), now, false);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function isCardDue(card: ReviewCard | undefined, now: Date = new Date()): boolean {
  if (!card) return false;
  // Due on a calendar day, not at a clock time: a card answered at 22:00 with a one-day interval is
  // ready the next morning.
  const at = new Date(card.due);
  return Number.isFinite(at.getTime()) && (at.getTime() <= now.getTime() || dayKey(at) <= dayKey(now));
}

/**
 * How well a skill is remembered right now: the average memory estimate over its answered
 * questions. Undefined when none of them has been answered yet.
 */
export function skillRetention(mastery: CourseMastery | undefined, skillId: string, now: Date = new Date()): number | undefined {
  const cards = Object.values(mastery?.cards ?? {}).filter((card) => card.skillId === skillId && card.reps > 0);
  if (cards.length === 0) return undefined;
  return cards.reduce((sum, card) => sum + retrievability(card, now), 0) / cards.length;
}

/** True when a skill is being forgotten and should be reviewed soon. */
export function isFading(mastery: CourseMastery | undefined, skillId: string, now: Date = new Date()): boolean {
  const retention = skillRetention(mastery, skillId, now);
  return retention !== undefined && retention < SRS.fadeBelow;
}

export interface DueCard {
  courseId: string;
  questionId: string;
  skillId: string;
  /** Days past the due date (0 on the due day). */
  overdueDays: number;
  /** Current memory estimate, lowest first in the queue. */
  retrievability: number;
  confidentMiss: boolean;
}

/**
 * Every card that is due, across all courses, most urgent first: mistakes the learner was sure
 * about, then the cards most likely to be forgotten. Cards whose question no longer exists in the
 * course (it was edited) are skipped.
 */
export function dueCards(
  courses: Course[],
  mastery: Record<string, CourseMastery>,
  questionExists: (courseId: string, questionId: string) => boolean,
  now: Date = new Date()
): DueCard[] {
  const out: DueCard[] = [];
  for (const course of courses) {
    for (const card of Object.values(mastery[course.id]?.cards ?? {})) {
      if (!isCardDue(card, now) || !questionExists(course.id, card.questionId)) continue;
      const overdue = Math.max(0, Math.floor((now.getTime() - new Date(card.due).getTime()) / 86_400_000));
      out.push({
        courseId: course.id,
        questionId: card.questionId,
        skillId: card.skillId,
        overdueDays: overdue,
        retrievability: retrievability(card, now),
        confidentMiss: card.confidentMiss === true
      });
    }
  }
  return out.sort(
    (a, b) =>
      Number(b.confidentMiss) - Number(a.confidentMiss) ||
      a.retrievability - b.retrievability ||
      a.courseId.localeCompare(b.courseId) ||
      a.questionId.localeCompare(b.questionId)
  );
}

/** How many cards were reviewed today (answered again after their first time). */
export function reviewedToday(mastery: Record<string, CourseMastery>, now: Date = new Date()): number {
  const today = dayKey(now);
  let count = 0;
  for (const record of Object.values(mastery)) {
    for (const card of Object.values(record.cards ?? {})) {
      if (card.reps > 1 && card.lastReview && dayKey(new Date(card.lastReview)) === today) count += 1;
    }
  }
  return count;
}

export interface TodayQueue {
  /** The cards to review now, at most the daily limit minus what was already reviewed today. */
  cards: DueCard[];
  /** Due cards held back for the coming days by the daily limit. */
  waiting: number;
  /** Reviews already done today. */
  done: number;
  limit: number;
}

/** Today's review session: the most urgent due cards, capped so a long break never overwhelms. */
export function todayQueue(due: DueCard[], done: number, limit: number = SRS.dailyLimit): TodayQueue {
  const cap = Math.max(0, Math.floor(limit));
  const room = Math.max(0, cap - Math.max(0, done));
  const cards = due.slice(0, room);
  return { cards, waiting: due.length - cards.length, done, limit: cap };
}
