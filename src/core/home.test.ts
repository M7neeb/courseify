import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSE_ACCENTS,
  GREETING_KEYS,
  courseAccent,
  courseAction,
  courseIconRow,
  coursesCompleted,
  entryModuleId,
  groupBySubject,
  greetingFor,
  greetingIndex,
  hasBeenOpened,
  homeBadges,
  moduleAction,
  moduleStatus,
  mostRecentlyOpened,
  skillsMastered,
  skillsProgress,
  streakWeeks
} from './home.ts';
import { MASTERY } from './mastery.ts';
import type { Course, CourseMastery, CourseProgress } from './types.ts';

const AT = '2026-10-14T10:00:00.000Z';

function lessonCourse(id: string, lessonIds: string[]): Course {
  return {
    schemaVersion: 2,
    id,
    title: id,
    modules: [
      {
        id: id + '-m1',
        title: 'Module 1',
        lessons: lessonIds.map((lessonId) => ({
          id: lessonId,
          title: lessonId,
          blocks: [
            {
              id: lessonId + '-b',
              type: 'quiz',
              questions: [{ id: lessonId + '-q', kind: 'true-false', prompt: '?', answer: true }]
            }
          ]
        }))
      }
    ]
  };
}

function progressRecord(id: string, lastOpened: string): CourseProgress {
  return { courseId: id, courseVersion: 1, completedLessons: [], answers: {}, videoOverrides: {}, lastOpened };
}

function skill(id: string, points: number) {
  return { skillId: id, points, firstTry: {}, updatedAt: AT };
}

// ---------- greeting ----------

test('a week or more of streak celebrates the week number', () => {
  assert.deepEqual(greetingFor('2026-10-14', 14), { key: 'home.greeting.week', vars: { n: 2 } });
  assert.deepEqual(greetingFor('2026-10-14', 7), { key: 'home.greeting.week', vars: { n: 1 } });
});

test('a short streak rotates a generic greeting, stable within the day', () => {
  const first = greetingFor('2026-10-14', 3);
  assert.deepEqual(first, greetingFor('2026-10-14', 3));
  assert.deepEqual(first.vars, {});
  assert.ok(GREETING_KEYS.includes(first.key as (typeof GREETING_KEYS)[number]));
});

test('greetingIndex stays inside range and tolerates an empty list', () => {
  for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
    const index = greetingIndex(day, GREETING_KEYS.length);
    assert.ok(index >= 0 && index < GREETING_KEYS.length);
  }
  assert.equal(greetingIndex('anything', 0), 0);
});

test('streak weeks count days 1-7 as week 1, 8-14 as week 2', () => {
  assert.equal(streakWeeks(0), 0);
  assert.equal(streakWeeks(1), 1);
  assert.equal(streakWeeks(7), 1);
  assert.equal(streakWeeks(8), 2);
  assert.equal(streakWeeks(14), 2);
  assert.equal(streakWeeks(15), 3);
});

// ---------- skills ----------

test('skills at Familiar or above are counted over the whole library', () => {
  const courses = [lessonCourse('c1', ['l1', 'l2']), lessonCourse('c2', ['l3'])];
  const mastery: Record<string, CourseMastery | undefined> = {
    c1: {
      courseId: 'c1',
      mistakes: [],
      updatedAt: AT,
      skills: {
        l1: { skillId: 'l1', points: MASTERY.points.familiar, firstTry: {}, updatedAt: AT },
        l2: { skillId: 'l2', points: MASTERY.points.attempted, firstTry: {}, updatedAt: AT }
      }
    }
  };
  const result = skillsProgress(courses, mastery);
  assert.equal(result.total, 3);
  assert.equal(result.done, 1);
  assert.equal(result.percent, 33);
});

test('an empty library has nothing to master', () => {
  assert.deepEqual(skillsProgress([], {}), { done: 0, total: 0, percent: 0 });
});

// ---------- resume vs start ----------

test('the most recently opened course wins the resume slot', () => {
  const progress: Record<string, CourseProgress | undefined> = {
    a: progressRecord('a', '2026-10-10T10:00:00.000Z'),
    b: progressRecord('b', '2026-10-14T09:00:00.000Z'),
    c: progressRecord('c', '2026-10-12T09:00:00.000Z')
  };
  assert.equal(mostRecentlyOpened(progress), 'b');
  assert.equal(mostRecentlyOpened({}), undefined);
});

test('a course is Resume once opened and Start before that', () => {
  const progress: Record<string, CourseProgress | undefined> = { a: progressRecord('a', AT) };
  assert.equal(hasBeenOpened(progress, 'a'), true);
  assert.equal(hasBeenOpened(progress, 'b'), false);
  assert.equal(courseAction('a', progress), 'resume');
  assert.equal(courseAction('b', progress), 'start');
});

// ---------- course tiles ----------

test('the course tile row caps at six and counts the overflow', () => {
  const courses = Array.from({ length: 8 }, (_, i) => lessonCourse('c' + i, ['l' + i]));
  const row = courseIconRow(courses);
  assert.equal(row.shown.length, 6);
  assert.equal(row.hidden, 2);
  assert.equal(courseIconRow(courses.slice(0, 3)).hidden, 0);
  assert.equal(courseIconRow(courses, 10).hidden, 0);
});

// ---------- module status ----------

// ---------- badges and per-module action ----------

test('a module row says Resume once anything is earned and Start before that', () => {
  assert.equal(moduleAction(0), 'start');
  assert.equal(moduleAction(1), 'resume');
  assert.equal(moduleAction(100), 'resume');
});

test('a course accent is stable per id and differs between ids', () => {
  assert.ok((COURSE_ACCENTS as readonly string[]).includes(courseAccent('course-a')));
  assert.equal(courseAccent('course-a'), courseAccent('course-a'));
  const spread = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => courseAccent('course-' + id)));
  assert.ok(spread.size > 1, 'different courses get different colours');
});

test('mastered and completed counts come from real skill points', () => {
  const courses = [lessonCourse('c1', ['l1', 'l2']), lessonCourse('c2', ['l3'])];
  const mastery: Record<string, CourseMastery | undefined> = {
    c1: {
      courseId: 'c1',
      mistakes: [],
      updatedAt: AT,
      skills: { l1: skill('l1', 100), l2: skill('l2', 50) }
    },
    c2: { courseId: 'c2', mistakes: [], updatedAt: AT, skills: { l3: skill('l3', 100) } }
  };
  assert.equal(skillsMastered(courses, mastery), 2);
  // c2 has every masterable skill mastered; c1 does not (l2 is only Familiar).
  assert.equal(coursesCompleted(courses, mastery), 1);
  assert.equal(coursesCompleted([], {}), 0);
  // A course with no questions to master never counts as completed.
  assert.equal(coursesCompleted([{ schemaVersion: 2, id: 'empty', title: 'empty', modules: [] }], {}), 0);
});

test('the badge strip counts real progress', () => {
  const courses = [lessonCourse('c1', ['l1', 'l2'])];
  const mastery: Record<string, CourseMastery | undefined> = {
    c1: {
      courseId: 'c1',
      mistakes: [],
      updatedAt: AT,
      skills: { l1: skill('l1', 100), l2: skill('l2', 50) }
    }
  };
  assert.deepEqual(homeBadges({ streak: 14, level: 3, activeDays: 9, courses, mastery }), [
    { id: 'weeks', count: 2 },
    { id: 'level', count: 3 },
    { id: 'familiar', count: 2 },
    { id: 'mastered', count: 1 },
    { id: 'courses', count: 0 },
    { id: 'days', count: 9 }
  ]);
  assert.deepEqual(homeBadges({ streak: 0, level: 1, activeDays: 0, courses: [], mastery: {} }), [
    { id: 'weeks', count: 0 },
    { id: 'level', count: 1 },
    { id: 'familiar', count: 0 },
    { id: 'mastered', count: 0 },
    { id: 'courses', count: 0 },
    { id: 'days', count: 0 }
  ]);
});

test('module status reads Not started, Mastery available or a percentage', () => {
  assert.deepEqual(moduleStatus(0, 'not-started', false), { key: 'home.module.notStarted', percent: 0 });
  assert.deepEqual(moduleStatus(0, 'not-started', true), { key: 'home.module.masteryAvailable', percent: 0 });
  assert.deepEqual(moduleStatus(15, 'attempted', true), {
    key: 'home.module.percent',
    tierKey: 'mastery.tier.attempted',
    percent: 15
  });
  assert.equal(moduleStatus(5, 'not-started', true).tierKey, 'mastery.tier.attempted');
  assert.deepEqual(moduleStatus(100, 'mastered', true), {
    key: 'home.module.percent',
    tierKey: 'mastery.tier.mastered',
    percent: 100
  });
});

// ---------- explore: subjects and the unit a course opens on ----------

test('courses group by subject, alphabetically, with subject-less courses last', () => {
  const net = { ...lessonCourse('net', ['a']), subject: 'Networks' };
  const sql = { ...lessonCourse('sql', ['b']), subject: ' Databases ' };
  const loose = lessonCourse('loose', ['c']);
  const ip = { ...lessonCourse('ip', ['d']), subject: 'Networks' };
  const groups = groupBySubject([net, loose, sql, ip]);
  assert.deepEqual(
    groups.map((g) => [g.subject, g.courses.map((c) => c.id)]),
    [
      ['Databases', ['sql']],
      ['Networks', ['net', 'ip']],
      ['', ['loose']]
    ]
  );
});

test('a course opens on the unit holding the saved position, else the first unit', () => {
  const course = lessonCourse('c', ['l1']);
  course.modules.push({ id: 'c-m2', title: 'Module 2', lessons: [{ id: 'l2', title: 'l2', blocks: [] }] });
  const at = (lessonId?: string): CourseProgress => ({
    ...progressRecord('c', AT),
    ...(lessonId ? { position: { lessonId } } : {})
  });
  assert.equal(entryModuleId(course, undefined), 'c-m1');
  assert.equal(entryModuleId(course, at('l2')), 'c-m2');
  assert.equal(entryModuleId(course, at('c-m2:test')), 'c-m2');
  assert.equal(entryModuleId(course, at('gone')), 'c-m1');
  assert.equal(entryModuleId({ ...course, modules: [] }, at('l2')), undefined);
});

test('Home, Progress and the badges count the same skills: lessons with questions, not a unit test on its own', async () => {
  const { courseProgress } = await import('./progressView.ts');
  const q = (id: string, skillId?: string) => ({ id, kind: 'true-false' as const, prompt: id, answer: true, ...(skillId ? { skillId } : {}) });
  const course = {
    schemaVersion: 2,
    id: 'mix',
    title: 'Mix',
    modules: [
      {
        id: 'm1',
        title: 'U1',
        lessons: [
          { id: 'l1', title: 'L1', blocks: [{ id: 'b', type: 'quiz', questions: [q('a')] }] },
          { id: 'l2', title: 'Reading only', blocks: [] }
        ],
        // A unit test whose questions name no lesson: they form their own group, not a lesson skill.
        test: { id: 't', type: 'module-test', questions: [q('t1'), q('t2', 'l1')] }
      }
    ]
  };
  const lessonMastered = { mix: { courseId: 'mix', skills: { l1: { skillId: 'l1', points: 100, firstTry: {}, updatedAt: '' } }, mistakes: {}, updatedAt: '' } };
  const home = skillsProgress([course], lessonMastered as never);
  const progress = courseProgress(course, lessonMastered.mix as never);
  assert.equal(home.total, progress.summary.total);
  assert.equal(home.total, 1);
  // Every lesson skill is mastered, so the course is complete.
  assert.equal(coursesCompleted([course], lessonMastered as never), 1);
  assert.equal(skillsMastered([course], lessonMastered as never), 1);
});
