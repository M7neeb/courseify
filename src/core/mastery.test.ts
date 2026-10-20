import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTERY,
  accuracyOf,
  applyOutcome,
  courseSkills,
  emptySkillMastery,
  moduleMasteryPercent,
  moduleMasteryPool,
  moduleMasteryRatio,
  pointsForTier,
  questionsToLevelUp,
  skillIndex,
  skillPoints,
  tierBelow,
  tierForPoints,
  type MasteryOutcome
} from './mastery.ts';
import type { Course, CourseMastery, SkillMastery } from './types.ts';

const AT = '2026-10-14T10:00:00.000Z';

function state(points: number, firstTry: Record<string, boolean> = {}, skillId = 's'): SkillMastery {
  return { skillId, points, firstTry, updatedAt: AT };
}

function outcome(questionId: string, correct: boolean, totalQuestions: number, inTest = false, usedHint = false): MasteryOutcome {
  return { questionId, correct, usedHint, inTest, totalQuestions };
}

// A two-module course; the module test question names the lesson's skill, as a real pack would.
function course(): Course {
  return {
    schemaVersion: 2,
    id: 'c1',
    title: 'Course 1',
    modules: [
      {
        id: 'm1',
        title: 'Module 1',
        lessons: [
          {
            id: 'l1',
            title: 'Lesson 1',
            blocks: [
              {
                id: 'b1',
                type: 'quiz',
                questions: [
                  { id: 'l1q1', kind: 'true-false', prompt: 'a?', answer: true },
                  { id: 'l1q2', kind: 'true-false', prompt: 'b?', answer: false }
                ]
              }
            ]
          },
          {
            id: 'l2',
            title: 'Lesson 2',
            blocks: [{ id: 'b2', type: 'quiz', questions: [{ id: 'l2q1', kind: 'true-false', prompt: 'c?', answer: true }] }]
          }
        ],
        test: {
          id: 'm1-test',
          type: 'module-test',
          questions: [{ id: 't1', kind: 'true-false', prompt: 'd?', answer: true, skillId: 'l1' }]
        }
      },
      {
        id: 'm2',
        title: 'Module 2',
        lessons: [{ id: 'm2l1', title: 'Only lesson', blocks: [{ id: 'b3', type: 'quiz', questions: [{ id: 'm2q1', kind: 'true-false', prompt: 'e?', answer: true }] }] }]
      }
    ]
  };
}

test('the tier is derived from the points, never stored separately', () => {
  assert.equal(tierForPoints(0), 'not-started');
  assert.equal(tierForPoints(9), 'not-started');
  assert.equal(tierForPoints(MASTERY.points.attempted), 'attempted');
  assert.equal(tierForPoints(49), 'attempted');
  assert.equal(tierForPoints(MASTERY.points.familiar), 'familiar');
  assert.equal(tierForPoints(79), 'familiar');
  assert.equal(tierForPoints(MASTERY.points.proficient), 'proficient');
  assert.equal(tierForPoints(99), 'proficient');
  assert.equal(tierForPoints(MASTERY.points.mastered), 'mastered');
});

test('pointsForTier is the inverse of tierForPoints', () => {
  for (const tier of ['not-started', 'attempted', 'familiar', 'proficient', 'mastered'] as const) {
    assert.equal(tierForPoints(pointsForTier(tier)), tier);
  }
});

test('one tier down never falls below Familiar', () => {
  assert.equal(tierBelow('mastered'), 'proficient');
  assert.equal(tierBelow('proficient'), 'familiar');
  assert.equal(tierBelow('familiar'), 'familiar');
});

test('an untouched skill is Not started', () => {
  const s = emptySkillMastery('l1');
  assert.equal(s.points, 0);
  assert.equal(tierForPoints(s.points), 'not-started');
});

test('first-try accuracy decides the practice tier', () => {
  let s = emptySkillMastery('s');
  s = applyOutcome(s, outcome('a', true, 3));
  s = applyOutcome(s, outcome('b', true, 3));
  assert.equal(s.points, MASTERY.points.attempted); // 2 of 3 first try is under 70%

  s = applyOutcome(s, outcome('c', true, 3)); // 3 of 3
  assert.equal(s.points, MASTERY.points.proficient);
});

test('70% first-try accuracy buys Familiar', () => {
  let s = emptySkillMastery('s');
  for (let i = 0; i < 10; i += 1) s = applyOutcome(s, outcome(`q${i}`, i < 7, 10));
  assert.equal(s.points, MASTERY.points.familiar);
});

test('a wrong attempt or a hint costs the first try', () => {
  const hinted = applyOutcome(emptySkillMastery('s'), outcome('q', true, 1, false, true));
  assert.equal(hinted.firstTry['q'], false);
  assert.equal(hinted.points, MASTERY.points.attempted);

  const missed = applyOutcome(emptySkillMastery('s'), outcome('q', false, 1));
  assert.equal(missed.firstTry['q'], false);
  assert.equal(missed.points, MASTERY.points.attempted);
});

test('a missed question counts again when it is the first answer in a later set', () => {
  // 5 of 7 missed: stuck at Attempted, and retrying straight after a miss never wins it back.
  let s = emptySkillMastery('s');
  for (let i = 0; i < 7; i += 1) s = applyOutcome(s, { ...outcome(`q${i}`, i < 2, 7), freshTry: true });
  for (let i = 2; i < 7; i += 1) s = applyOutcome(s, { ...outcome(`q${i}`, true, 7), freshTry: false });
  assert.equal(s.points, MASTERY.points.attempted);
  // A later set: three of the missed ones right first time is 5 of 7, over 70%.
  for (let i = 2; i < 5; i += 1) s = applyOutcome(s, { ...outcome(`q${i}`, true, 7), freshTry: true });
  assert.equal(s.firstTry['q2'], true);
  assert.equal(s.points, MASTERY.points.familiar);
  // A hint in the later set does not win it back.
  s = applyOutcome(s, { ...outcome('q5', true, 7, false, true), freshTry: true });
  assert.equal(s.firstTry['q5'], false);
});

test('Mastered needs a Proficient skill answered 100% first-try inside a module test', () => {
  const proficient = state(MASTERY.points.proficient, { q: true });
  // Practice alone never promotes.
  assert.equal(applyOutcome(proficient, outcome('q', true, 1, false)).points, MASTERY.points.proficient);
  // The same answer inside a test does.
  assert.equal(applyOutcome(proficient, outcome('q', true, 1, true)).points, MASTERY.points.mastered);
});

test('a wrong answer in a module test costs exactly one tier, never more', () => {
  const mastered = state(MASTERY.points.mastered, { q: true });
  const once = applyOutcome(mastered, outcome('q', false, 1, true));
  assert.equal(once.points, MASTERY.points.proficient); // 100 -> 80, not straight to 50

  const twice = applyOutcome(once, outcome('q', false, 1, true));
  assert.equal(twice.points, MASTERY.points.familiar); // 80 -> 50

  const thrice = applyOutcome(twice, outcome('q', false, 1, true));
  assert.equal(thrice.points, MASTERY.points.familiar); // never below Familiar
});

test('lesson practice never lowers a skill that has reached Proficient', () => {
  const proficient = state(MASTERY.points.proficient, { q: true });
  assert.equal(applyOutcome(proficient, outcome('q', false, 1, false)).points, MASTERY.points.proficient);
});

test('accuracyOf counts first-try flags over the whole skill', () => {
  assert.equal(accuracyOf(state(0, { a: true, b: false, c: true }), 4), 0.5);
  assert.equal(accuracyOf(undefined, 4), 0);
  assert.equal(accuracyOf(state(0, { a: true }), 0), 1);
});

test('a skill is the questions of one lesson, and a test question can name one', () => {
  const c = course();
  const l1 = courseSkills(c).find((s) => s.id === 'l1');
  assert.ok(l1);
  assert.deepEqual([...l1.questionIds].sort(), ['l1q1', 'l1q2', 't1']);
  assert.equal(l1.lessonId, 'l1');
  assert.equal(l1.moduleId, 'm1');

  const index = skillIndex(c);
  assert.equal(index.get('l1q1'), 'l1');
  assert.equal(index.get('t1'), 'l1');
  assert.equal(index.get('l2q1'), 'l2');
});

test('module mastery is earned points over the maximum of one hundred per lesson', () => {
  const c = course();
  const mastery: CourseMastery = {
    courseId: 'c1',
    mistakes: [],
    updatedAt: AT,
    skills: { l1: state(MASTERY.points.proficient, {}, 'l1'), l2: state(MASTERY.points.familiar, {}, 'l2') }
  };
  assert.equal(moduleMasteryRatio(c, mastery, 'm1'), 130 / 200);
  assert.equal(moduleMasteryPercent(c, mastery, 'm1'), 65);
  assert.equal(moduleMasteryPercent(c, undefined, 'm1'), 0);
  assert.equal(skillPoints(mastery, 'l1'), 80);
  assert.equal(skillPoints(mastery, 'nope'), 0);
});

test('a module with nothing to master is already complete', () => {
  const textOnly: Course = {
    schemaVersion: 2,
    id: 'x',
    title: 'X',
    modules: [{ id: 'm1', title: 'M1', lessons: [{ id: 'l1', title: 'L', blocks: [{ id: 'b', type: 'text', markdown: 'hello' }] }] }]
  };
  assert.equal(moduleMasteryRatio(textOnly, undefined, 'm1'), 1);
  assert.equal(moduleMasteryPercent(textOnly, undefined, 'm1'), 100);
});

// ---------- the tracked fields on a skill ----------

test('every graded attempt stamps lastPracticedAt and counts the misses', () => {
  const at = new Date('2026-10-14T12:00:00.000Z');
  let s = emptySkillMastery('s', new Date('2026-10-01T00:00:00.000Z'));
  assert.equal(s.timesMissed, 0);

  s = applyOutcome(s, outcome('a', true, 3), at);
  assert.equal(s.lastPracticedAt, at.toISOString());
  assert.equal(s.timesMissed, 0, 'a correct answer is not a miss');

  s = applyOutcome(s, outcome('b', true, 3, false, true), at);
  assert.equal(s.timesMissed, 0, 'a hint is not a miss either');

  s = applyOutcome(s, outcome('c', false, 3), at);
  assert.equal(s.timesMissed, 1);
  assert.equal(s.lastPracticedAt, at.toISOString());

  s = applyOutcome(s, outcome('c', false, 3), at);
  assert.equal(s.timesMissed, 2, 'a question missed again counts again');
});

test('a record saved before the tracked fields existed still moves forward', () => {
  const legacy: SkillMastery = { skillId: 's', points: MASTERY.points.familiar, firstTry: { q: true }, updatedAt: AT };
  const next = applyOutcome(legacy, outcome('q2', false, 2), new Date(AT));
  assert.equal(next.timesMissed, 1);
  assert.ok(next.lastPracticedAt);
});

// ---------- mixed assessment ----------

test('Mastered is reached only through a mixed assessment', () => {
  // 100% first try in plain practice only reaches Proficient.
  let s = emptySkillMastery('s');
  s = applyOutcome(s, outcome('q', true, 1), ATDate());
  assert.equal(s.points, MASTERY.points.proficient);

  // The same skill answered cleanly inside a module test becomes Mastered.
  s = applyOutcome(s, outcome('q', true, 1, true), ATDate());
  assert.equal(s.points, MASTERY.points.mastered);
});

test('a wrong answer inside a mixed assessment drops exactly one tier, floored at Familiar', () => {
  const dropFrom = (points: number) => applyOutcome(state(points, { q: true }), outcome('q', false, 1, true), ATDate()).points;
  assert.equal(dropFrom(MASTERY.points.mastered), MASTERY.points.proficient);
  assert.equal(dropFrom(MASTERY.points.proficient), MASTERY.points.familiar);
  assert.equal(dropFrom(MASTERY.points.familiar), MASTERY.points.familiar);
});

function ATDate(): Date {
  return new Date(AT);
}

test('questions to level up follows the Familiar accuracy rule, never below one', () => {
  assert.equal(questionsToLevelUp(0), 0);
  assert.equal(questionsToLevelUp(1), 1);
  assert.equal(questionsToLevelUp(4), 3);
  assert.equal(questionsToLevelUp(10), 7);
});

test('a module can award one hundred mastery points per masterable lesson', () => {
  const c = course();
  assert.equal(moduleMasteryPool(c, 'm1'), 200);
  assert.equal(moduleMasteryPool(c, 'nope'), 0);
});
