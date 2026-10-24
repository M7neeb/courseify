import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SRS,
  applyCard,
  dueCards,
  isCardDue,
  isFading,
  ratingFor,
  retrievability,
  reviewedToday,
  scheduleCard,
  skillRetention,
  todayQueue
} from './srs.ts';
import { MASTERY, courseSkills, skillPoints, storedPoints } from './mastery.ts';
import { indexQuestions } from './mistakes.ts';
import { buildChallengeSet, buildExerciseSet } from './exercise.ts';
import type { Course, CourseMastery, Question, ReviewCard } from './types.ts';

const NOW = new Date('2026-10-17T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const later = (days: number) => new Date(NOW.getTime() + days * DAY);

const right = { correct: true, usedHint: false };
const wrong = { correct: false, usedHint: false };

test('ratings: wrong is Again, hinted or unsure is Hard, clean is Good', () => {
  assert.equal(ratingFor(false, false), 1);
  assert.equal(ratingFor(true, true), 2);
  assert.equal(ratingFor(true, false, 'unsure'), 2);
  assert.equal(ratingFor(true, false, 'guess'), 2);
  assert.equal(ratingFor(true, false, 'sure'), 3);
  assert.equal(ratingFor(true, false), 3);
});

test('a right answer is due later than a wrong one', () => {
  const good = scheduleCard(undefined, 'q1', 's1', right, NOW);
  const bad = scheduleCard(undefined, 'q1', 's1', wrong, NOW);
  assert.ok(new Date(good.due) > new Date(bad.due));
  assert.equal(isCardDue(bad, later(1)), true);
  assert.equal(isCardDue(good, later(1)), false);
  assert.equal(good.reps, 1);
  assert.equal(good.skillId, 's1');
});

test('intervals grow with each right review', () => {
  const first = scheduleCard(undefined, 'q1', 's1', right, NOW);
  const second = scheduleCard(first, 'q1', 's1', right, new Date(first.due));
  assert.ok(second.scheduledDays > first.scheduledDays);
});

test('a miss corrected the same day still comes back the next day', () => {
  const missed = scheduleCard(undefined, 'q1', 's1', wrong, NOW);
  const corrected = scheduleCard(missed, 'q1', 's1', right, new Date(NOW.getTime() + 60_000));
  assert.deepEqual(corrected, missed);
  assert.equal(isCardDue(corrected, later(1)), true);
});

test('a wrong answer later the same day does lower a right one', () => {
  const good = scheduleCard(undefined, 'q1', 's1', right, NOW);
  const bad = scheduleCard(good, 'q1', 's1', wrong, new Date(NOW.getTime() + 60_000));
  assert.ok(new Date(bad.due) < new Date(good.due));
});

test('a confident mistake is flagged until answered right', () => {
  const miss = scheduleCard(undefined, 'q1', 's1', { ...wrong, confidence: 'sure' }, NOW);
  assert.equal(miss.confidentMiss, true);
  const fixed = scheduleCard(miss, 'q1', 's1', right, new Date(miss.due));
  assert.equal(fixed.confidentMiss, undefined);
});

test('memory fades over time and is unknown for unanswered skills', () => {
  const card = scheduleCard(undefined, 'q1', 's1', right, NOW);
  assert.ok(retrievability(card, later(1)) > retrievability(card, later(60)));
  const mastery: CourseMastery = { courseId: 'c1', skills: {}, mistakes: [], updatedAt: NOW.toISOString(), cards: { q1: card } };
  assert.equal(skillRetention(mastery, 'other', NOW), undefined);
  assert.equal(isFading(mastery, 's1', later(1)), false);
  assert.equal(isFading(mastery, 's1', later(60)), true);
});

function masteredRecord(card: ReviewCard): CourseMastery {
  return {
    courseId: 'c1',
    skills: { s1: { skillId: 's1', points: MASTERY.points.mastered, firstTry: { q1: true }, updatedAt: NOW.toISOString() } },
    mistakes: [],
    updatedAt: NOW.toISOString(),
    cards: { q1: card }
  };
}

test('a forgotten Mastered skill shows as Proficient, but its stored points stay', () => {
  const record = masteredRecord(scheduleCard(undefined, 'q1', 's1', right, NOW));
  assert.equal(skillPoints(record, 's1', later(1)), MASTERY.points.mastered);
  assert.equal(skillPoints(record, 's1', later(120)), MASTERY.points.proficient);
  assert.equal(storedPoints(record, 's1'), MASTERY.points.mastered);
});

test('a Mastered skill with no cards (saved before cards existed) never fades', () => {
  const record = masteredRecord(scheduleCard(undefined, 'q1', 's1', right, NOW));
  delete record.cards;
  assert.equal(skillPoints(record, 's1', later(365)), MASTERY.points.mastered);
});

test('applyCard leaves other cards alone', () => {
  const cards = applyCard(undefined, 'q1', 's1', right, NOW);
  const next = applyCard(cards, 'q2', 's1', wrong, NOW);
  assert.deepEqual(next.q1, cards.q1);
  assert.ok(next.q2);
});

function course(id: string, lessons: number, perLesson: number): Course {
  return {
    schemaVersion: 2,
    id,
    title: id,
    modules: [
      {
        id: 'm1',
        title: 'M1',
        lessons: Array.from({ length: lessons }, (_, l) => ({
          id: `l${l + 1}`,
          title: `L${l + 1}`,
          blocks: [
            {
              id: `b${l + 1}`,
              type: 'quiz',
              questions: Array.from({ length: perLesson }, (_, q): Question => ({
                id: `l${l + 1}q${q + 1}`,
                kind: 'true-false',
                prompt: '?',
                answer: true
              }))
            }
          ]
        }))
      }
    ]
  };
}

test('due cards: confident mistakes first, then the most forgotten; deleted questions skipped', () => {
  const c = course('c1', 1, 3);
  let cards = applyCard(undefined, 'l1q1', 'l1', right, NOW);
  cards = applyCard(cards, 'l1q2', 'l1', { ...wrong, confidence: 'sure' }, NOW);
  cards = applyCard(cards, 'l1q3', 'l1', wrong, NOW);
  cards = applyCard(cards, 'gone', 'l1', wrong, NOW);
  const mastery = { c1: { courseId: 'c1', skills: {}, mistakes: [], updatedAt: NOW.toISOString(), cards } };
  const exists = (_: string, qid: string) => qid !== 'gone';
  const due = dueCards([c], mastery, exists, later(30));
  assert.deepEqual(due.map((d) => d.questionId).slice(0, 1), ['l1q2']);
  assert.ok(!due.some((d) => d.questionId === 'gone'));
  assert.equal(due.length, 3);
  assert.equal(dueCards([c], mastery, exists, NOW).length, 0);
});

test('today queue is capped and counts what was already done', () => {
  const due = Array.from({ length: 50 }, (_, i) => ({ courseId: 'c', questionId: `q${i}`, skillId: 's', overdueDays: 0, retrievability: 0.5, confidentMiss: false }));
  const fresh = todayQueue(due, 0, 20);
  assert.equal(fresh.cards.length, 20);
  assert.equal(fresh.waiting, 30);
  const halfway = todayQueue(due, 15, 20);
  assert.equal(halfway.cards.length, 5);
  assert.equal(todayQueue(due, 25, 20).cards.length, 0);
  assert.equal(SRS.dailyLimit, 20);
});

test('reviewedToday only counts repeat answers made today', () => {
  const first = scheduleCard(undefined, 'q1', 's1', right, later(-10));
  const again = scheduleCard(first, 'q1', 's1', right, NOW);
  const newToday = scheduleCard(undefined, 'q2', 's1', right, NOW);
  const mastery = { c: { courseId: 'c', skills: {}, mistakes: [], updatedAt: '', cards: { q1: again, q2: newToday } } };
  assert.equal(reviewedToday(mastery, NOW), 1);
});

test('practice sets ask due cards first', () => {
  const c = course('c1', 1, 6);
  const cards = applyCard(undefined, 'l1q4', 'l1', wrong, NOW);
  const mastery: CourseMastery = { courseId: 'c1', skills: {}, mistakes: [], updatedAt: '', cards };
  const set = buildExerciseSet(c, 'l1', 5, { mastery, now: later(2) });
  assert.equal(set.questions[0]?.id, 'l1q4');
  assert.equal(set.reasons[0], 'review');
});

test('a course challenge mixes skills, never repeats a question, and respects the cap', () => {
  const c = course('c1', 4, 3);
  const set = buildChallengeSet(c, 42, { perSkill: 2 });
  assert.equal(set.length, 8);
  assert.equal(new Set(set.map((q) => q.id)).size, set.length);
  for (const lesson of ['l1', 'l2', 'l3', 'l4']) {
    assert.equal(set.filter((q) => q.id.startsWith(lesson + 'q')).length, 2);
  }
  assert.equal(buildChallengeSet(c, 42, { perSkill: 3, maxSize: 5 }).length, 5);
  assert.deepEqual(buildChallengeSet(c, 7).map((q) => q.id), buildChallengeSet(c, 7).map((q) => q.id));
});

test('a challenge on a skill with one question asks it once', () => {
  const c = course('c1', 2, 1);
  assert.equal(buildChallengeSet(c, 1, { perSkill: 2 }).length, 2);
});

test('warm-up (pretest) questions never count as skill or review questions', () => {
  const c = course('c1', 1, 2);
  const lesson = c.modules[0]!.lessons[0]!;
  lesson.blocks.unshift({ id: 'warm', type: 'quiz', pretest: true, questions: [{ id: 'w1', kind: 'true-false', prompt: '?', answer: true }] });
  const skill = courseSkills(c).find((s) => s.id === 'l1');
  assert.deepEqual(skill?.questionIds, ['l1q1', 'l1q2']);
  assert.equal(indexQuestions(c).has('w1'), false);
});

test('a card is due on its day, not only from its clock time', () => {
  const card = { due: new Date(2026, 9, 25, 22, 0).toISOString() } as Parameters<typeof isCardDue>[0];
  assert.equal(isCardDue(card, new Date(2026, 9, 25, 8, 0)), true);
  assert.equal(isCardDue(card, new Date(2026, 9, 24, 23, 0)), false);
});
