import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, examPlan, longestStreak, MILESTONES, milestoneStates, weekReport, weekStart, type MilestoneInput } from './goals.ts';
import type { Course } from './types.ts';

const lesson = (id: string, filled = true) => ({ id, title: id, blocks: filled ? [{ id: id + '-b', type: 'text' }] : [] });
const course = {
  schemaVersion: 2,
  id: 'c',
  title: 'C',
  modules: [{ id: 'm1', title: 'M', lessons: [lesson('l1'), lesson('l2'), lesson('l3'), lesson('l4'), lesson('l5', false)] }]
} as unknown as Course;

test('days between calendar days, across months', () => {
  assert.equal(daysBetween('2026-10-22', '2026-10-25'), 3);
  assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2);
  assert.equal(daysBetween('2026-10-22', '2026-10-21'), -1);
});

test('the exam plan spreads the lessons left and keeps the last day free', () => {
  const progress = { completedLessons: ['l1'] } as never;
  // 3 lessons left (an empty lesson does not count), 4 days left: 3 study days, 1 lesson a day.
  const plan = examPlan(course, progress, '2026-10-26', '2026-10-22')!;
  assert.equal(plan.lessonsLeft, 3);
  assert.equal(plan.daysLeft, 4);
  assert.equal(plan.lessonsPerDay, 1);
  assert.equal(plan.phase, 'learn');
  // Two days left: everything in one day.
  assert.equal(examPlan(course, progress, '2026-10-24', '2026-10-22')!.lessonsPerDay, 3);
  assert.equal(examPlan(course, progress, '2026-10-23', '2026-10-22')!.phase, 'last');
  assert.equal(examPlan(course, progress, '2026-10-22', '2026-10-22')!.phase, 'today');
  assert.equal(examPlan(course, { completedLessons: ['l1', 'l2', 'l3', 'l4'] } as never, '2026-10-30', '2026-10-22')!.phase, 'review');
  // Past or missing dates have no plan.
  assert.equal(examPlan(course, progress, '2026-10-01', '2026-10-22'), null);
  assert.equal(examPlan(course, progress, undefined, '2026-10-22'), null);
  assert.equal(examPlan(course, progress, 'soon', '2026-10-22'), null);
});

test('weeks start on Monday and the report adds up the days and the skills that grew', () => {
  assert.equal(weekStart('2026-10-22'), '2026-10-19');
  assert.equal(weekStart('2026-10-19'), '2026-10-19');
  assert.equal(weekStart('2026-10-25'), '2026-10-19');
  const activity = {
    '2026-10-19': { day: '2026-10-19', correct: 3, lessons: 1, xp: 35 },
    '2026-10-21': { day: '2026-10-21', correct: 10, lessons: 2, xp: 110 },
    '2026-10-26': { day: '2026-10-26', correct: 50, lessons: 5, xp: 500 }
  };
  const r = weekReport('2026-10-19', activity, { week: '2026-10-19', points: { c: { l1: 20, l2: 80 } } }, { c: { l1: 60, l2: 80, l3: 10 } });
  assert.equal(r.xp, 145);
  assert.equal(r.correct, 13);
  assert.equal(r.lessons, 3);
  assert.equal(r.activeDays, 2);
  assert.deepEqual(r.bestDay, { day: '2026-10-21', xp: 110 });
  assert.equal(r.days.length, 7);
  assert.deepEqual(r.stronger.map((s) => s.skillId), ['l1', 'l3']);
  // Without a snapshot from that week nothing is claimed to have grown.
  assert.equal(weekReport('2026-10-19', activity, undefined, { c: { l1: 60 } }).stronger.length, 0);
});

test('the longest streak counts consecutive active days', () => {
  const day = (d: string) => ({ day: d, correct: 1, lessons: 0, xp: 10 });
  const a = { x: day('2026-10-01'), y: day('2026-10-02'), z: day('2026-10-03'), w: day('2026-10-05') };
  assert.equal(longestStreak(a), 3);
  assert.equal(longestStreak({}), 0);
});

test('milestones are earned from real numbers and new ones are reported once', () => {
  const input: MilestoneInput = { lessonsDone: 12, skillsMastered: 0, coursesDone: 0, correctAnswers: 120, bestStreak: 2, reviewsDone: 0, chessWins: 1, bestBotBeaten: 800, endgamesSolved: 0 };
  const first = milestoneStates(input, {}, '2026-10-22T10:00:00Z');
  assert.deepEqual(first.fresh.sort(), ['chess-first-win', 'correct-100', 'first-lesson', 'lessons-10']);
  const seen = Object.fromEntries(first.fresh.map((id) => [id, '2026-10-20T10:00:00Z']));
  const again = milestoneStates(input, seen, '2026-10-22T10:00:00Z');
  assert.equal(again.fresh.length, 0);
  assert.equal(again.states.find((s) => s.milestone.id === 'lessons-10')?.at, '2026-10-20T10:00:00Z');
  assert.equal(new Set(MILESTONES.map((m) => m.id)).size, MILESTONES.length);
});
