import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXERCISE,
  applyReview,
  buildExerciseSet,
  clampSetSize,
  isDue,
  reviewInterval,
  scheduleMiss,
  skillQuestions
} from './exercise.ts';
import type { Course, CourseMastery, Question, QuestionReview, SkillMastery } from './types.ts';

const NOW = new Date('2026-10-14T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const past = new Date(NOW.getTime() - DAY).toISOString();
const future = new Date(NOW.getTime() + DAY).toISOString();

/** A one-module, one-lesson course whose lesson holds `count` true/false questions. */
function lessonCourse(count: number, extra: (index: number) => Partial<Question> = () => ({})): Course {
  const questions: Question[] = Array.from({ length: count }, (_, i) => ({
    id: `q${i + 1}`,
    kind: 'true-false',
    prompt: `Question ${i + 1}?`,
    answer: true,
    ...extra(i + 1)
  }));
  return {
    schemaVersion: 2,
    id: 'c1',
    title: 'Course 1',
    modules: [
      {
        id: 'm1',
        title: 'Module 1',
        lessons: [{ id: 'l1', title: 'Lesson 1', blocks: [{ id: 'b1', type: 'quiz', questions }] }]
      }
    ]
  };
}

function mastery(
  skillId: string,
  state: Partial<SkillMastery> = {},
  reviews: Record<string, QuestionReview> = {}
): CourseMastery {
  const skill: SkillMastery = { skillId, points: 0, firstTry: {}, updatedAt: NOW.toISOString(), ...state };
  return { courseId: 'c1', skills: { [skillId]: skill }, mistakes: [], reviews, updatedAt: NOW.toISOString() };
}

function ids(set: { questions: Question[] }): string[] {
  return set.questions.map((q) => q.id);
}

// ---------- set construction ----------

test('due and missed questions come first, then never-attempted ones, then the rest', () => {
  const c = lessonCourse(6);
  // q1 was missed and is due; q2 was answered right; q3 was missed but has no schedule.
  const m = mastery('l1', { firstTry: { q2: true, q3: false } }, { q1: { questionId: 'q1', misses: 1, nextAt: past } });
  const set = buildExerciseSet(c, 'l1', 7, { mastery: m, now: NOW });

  assert.equal(set.questions.length, 5);
  assert.deepEqual(set.reasons, ['review', 'new', 'new', 'new', 'seen']);
  assert.equal(set.questions[0]?.id, 'q1');
  assert.equal(set.poolSize, 6);
  assert.equal(set.repeats, false);
});

test('no question appears twice while the pool is at least as large as the set', () => {
  const c = lessonCourse(6);
  const set = buildExerciseSet(c, 'l1', 11, { now: NOW });
  assert.equal(set.questions.length, 5);
  assert.equal(new Set(ids(set)).size, 5);
  assert.equal(set.repeats, false);
});

test('every question in a set belongs to the requested skill', () => {
  const c: Course = {
    schemaVersion: 2,
    id: 'c1',
    title: 'Course 1',
    modules: [
      {
        id: 'm1',
        title: 'M1',
        lessons: [
          { id: 'l1', title: 'L1', blocks: [{ id: 'b1', type: 'quiz', questions: [{ id: 'a1', kind: 'true-false', prompt: 'a?', answer: true }] }] },
          { id: 'l2', title: 'L2', blocks: [{ id: 'b2', type: 'quiz', questions: [{ id: 'b1q', kind: 'true-false', prompt: 'b?', answer: true }] }] }
        ]
      }
    ]
  };
  const set = buildExerciseSet(c, 'l1', 1, { now: NOW });
  // The lesson has a single question, so the set cycles it - but only that question appears.
  assert.deepEqual([...new Set(ids(set))], ['a1']);
  assert.deepEqual(skillQuestions(c, 'l1').map((q) => q.id), ['a1']);
});

test('a pool smaller than the set repeats questions, and says so', () => {
  const c = lessonCourse(2);
  const set = buildExerciseSet(c, 'l1', 1, { now: NOW });

  assert.equal(set.poolSize, 2);
  assert.equal(set.repeats, true);
  assert.equal(set.questions.length, EXERCISE.defaultSize);
  assert.deepEqual(set.reasons, ['new', 'new', 'repeat', 'repeat', 'repeat']);
  assert.equal(new Set(ids(set)).size, 2);
});

test('the set size clamps to the configured minimum and maximum', () => {
  assert.equal(clampSetSize(undefined), EXERCISE.defaultSize);
  assert.equal(clampSetSize(1), EXERCISE.minSize);
  assert.equal(clampSetSize(4), 4);
  assert.equal(clampSetSize(99), EXERCISE.maxSize);

  const c = lessonCourse(6);
  assert.equal(buildExerciseSet(c, 'l1', 1, { size: 99, now: NOW }).questions.length, EXERCISE.maxSize);
});

test('a missed question that is not yet due waits its turn', () => {
  const c = lessonCourse(4);
  const m = mastery('l1', {}, { q1: { questionId: 'q1', misses: 1, nextAt: future } });
  const set = buildExerciseSet(c, 'l1', 3, { size: 3, mastery: m, now: NOW });

  assert.equal(set.questions.length, 3);
  assert.equal(set.reasons[0], 'new');
  assert.ok(!ids(set).includes('q1'));
});

test('a due question with a variantGroup is asked as a sibling from the group', () => {
  const c = lessonCourse(5, (i) => (i <= 2 ? { variantGroup: 'g1' } : {}));
  const m = mastery('l1', {}, { q1: { questionId: 'q1', misses: 1, nextAt: past } });
  const set = buildExerciseSet(c, 'l1', 5, { mastery: m, now: NOW });

  assert.equal(set.reasons[0], 'variant');
  assert.equal(set.questions[0]?.id, 'q2');
  assert.ok(!ids(set).includes('q1'));
});

test('with no sibling, the exact missed question is asked instead', () => {
  const c = lessonCourse(4, (i) => (i === 1 ? { variantGroup: 'solo' } : {}));
  const m = mastery('l1', {}, { q1: { questionId: 'q1', misses: 1, nextAt: past } });
  const set = buildExerciseSet(c, 'l1', 5, { mastery: m, now: NOW });

  assert.equal(set.reasons[0], 'review');
  assert.equal(set.questions[0]?.id, 'q1');
});

test('the same seed builds the same set', () => {
  const c = lessonCourse(8);
  const a = buildExerciseSet(c, 'l1', 42, { now: NOW });
  const b = buildExerciseSet(c, 'l1', 42, { now: NOW });
  assert.deepEqual(ids(a), ids(b));
});

// ---------- spaced re-review ----------

test('a wrong answer schedules a review in one day, then three, then seven', () => {
  let r = scheduleMiss(undefined, 'q', NOW);
  assert.equal(r.misses, 1);
  assert.equal(new Date(r.nextAt).getTime(), NOW.getTime() + DAY);

  r = scheduleMiss(r, 'q', NOW);
  assert.equal(r.misses, 2);
  assert.equal(new Date(r.nextAt).getTime(), NOW.getTime() + 3 * DAY);

  r = scheduleMiss(r, 'q', NOW);
  assert.equal(r.misses, 3);
  assert.equal(new Date(r.nextAt).getTime(), NOW.getTime() + 7 * DAY);

  r = scheduleMiss(r, 'q', NOW);
  assert.equal(r.misses, 4);
  assert.equal(new Date(r.nextAt).getTime(), NOW.getTime() + 7 * DAY, 'the interval is capped at seven days');
});

test('reviewInterval follows the configured days and caps at the last one', () => {
  assert.equal(reviewInterval(1), 1);
  assert.equal(reviewInterval(2), 3);
  assert.equal(reviewInterval(3), 7);
  assert.equal(reviewInterval(9), 7);
});

test('isDue is true only once the review time has arrived', () => {
  assert.equal(isDue(undefined, NOW), false);
  assert.equal(isDue({ questionId: 'q', misses: 1, nextAt: past }, NOW), true);
  assert.equal(isDue({ questionId: 'q', misses: 1, nextAt: future }, NOW), false);
});

test('applyReview records a miss and clears the question once it is answered right', () => {
  const afterMiss = applyReview(undefined, 'q', false, NOW);
  assert.equal(afterMiss['q']?.misses, 1);

  const afterSecondMiss = applyReview(afterMiss, 'q', false, NOW);
  assert.equal(afterSecondMiss['q']?.misses, 2);

  const cleared = applyReview(afterSecondMiss, 'q', true, NOW);
  assert.deepEqual(cleared, {});
});

test('a mock exam spreads questions over the course and gives time per question kind', async () => {
  const { buildMockExam, examMinutes } = await import('./exercise.ts');
  const course = JSON.parse(readFileSync(new URL('../../examples/sample-course.json', import.meta.url), 'utf8'));
  const exam = buildMockExam(course, 42, 10);
  assert.ok(exam.length > 0 && exam.length <= 10);
  assert.equal(new Set(exam.map((q) => q.id)).size, exam.length);
  // The same seed builds the same exam.
  assert.deepEqual(buildMockExam(course, 42, 10).map((q) => q.id), exam.map((q) => q.id));
  const q = (kind: string) => ({ id: kind, kind, prompt: 'p' }) as never;
  assert.equal(examMinutes([q('written'), q('written'), q('multiple-choice')]), 10);
  assert.equal(examMinutes([q('true-false')]), 5);
});
