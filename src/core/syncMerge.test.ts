import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings } from './settings.ts';
import { mergeMastery, mergeSyncData, parseSyncFile, sameData, syncDataFrom, SYNC_FORMAT_VERSION, type SyncData } from './syncMerge.ts';
import type { Course, CourseMastery, CourseProgress, SavedGame } from './types.ts';

const NOW = new Date('2026-10-23T12:00:00.000Z');

function course(id: string, version = 1, title = id): Course {
  return {
    schemaVersion: 2,
    id,
    title,
    version,
    modules: [{ id: 'm1', title: 'M1', lessons: [{ id: 'l1', title: 'L1', blocks: [{ id: 'b1', type: 'text', markdown: 'Hi' }] }, { id: 'l2', title: 'L2', blocks: [{ id: 'b2', type: 'text', markdown: 'Ho' }] }] }]
  } as Course;
}

function progress(courseId: string, lastOpened: string, patch: Partial<CourseProgress> = {}): CourseProgress {
  return { courseId, courseVersion: 1, completedLessons: [], answers: {}, videoOverrides: {}, lastOpened, ...patch };
}

function empty(): SyncData {
  return {
    courses: [],
    progress: [],
    courseMeta: [],
    settings: defaultSettings(),
    mastery: [],
    activity: [],
    trash: [],
    games: [],
    chess: { endgames: {} },
    drills: {},
    milestones: {},
    tombstones: {}
  };
}

function data(patch: Partial<SyncData>): SyncData {
  return { ...empty(), ...patch };
}

test('a course added on one device shows up on the other', () => {
  const pc = data({ courses: [course('a')] });
  const phone = data({ courses: [course('b')] });
  const merged = mergeSyncData(phone, pc, NOW);
  assert.deepEqual(merged.courses.map((c) => c.id), ['a', 'b']);
});

test('progress: answers keep the newer one per question, completed lessons are combined', () => {
  const pc = data({
    courses: [course('a')],
    progress: [
      progress('a', '2026-10-20T10:00:00.000Z', {
        completedLessons: ['l1'],
        answers: {
          q1: { given: 'x', correct: false, at: '2026-10-20T10:00:00.000Z', attempts: 1 },
          q2: { given: 'y', correct: true, at: '2026-10-20T10:00:00.000Z', attempts: 1 }
        }
      })
    ]
  });
  const phone = data({
    courses: [course('a')],
    progress: [
      progress('a', '2026-10-21T10:00:00.000Z', {
        completedLessons: ['l2'],
        answers: { q1: { given: 'z', correct: true, at: '2026-10-21T10:00:00.000Z', attempts: 2 } }
      })
    ]
  });
  const merged = mergeSyncData(pc, phone, NOW);
  const p = merged.progress[0] as CourseProgress;
  assert.deepEqual([...p.completedLessons].sort(), ['l1', 'l2']);
  assert.equal(p.answers.q1?.given, 'z');
  assert.equal(p.answers.q2?.given, 'y');
  assert.equal(p.lastOpened, '2026-10-21T10:00:00.000Z');
});

test('progress: a cleared report stays cleared, a new one from the other device comes over', () => {
  const older = progress('a', '2026-10-20T10:00:00.000Z', {
    reports: {
      q1: { reason: 'wrong', at: '2026-10-19T10:00:00.000Z' },
      q3: { reason: 'typo', at: '2026-10-22T09:00:00.000Z' }
    }
  });
  // The newer copy cleared q1 on 2026-10-21; q3 was reported later on the other device.
  const newer = progress('a', '2026-10-21T10:00:00.000Z', { reports: {} });
  const merged = mergeSyncData(data({ courses: [course('a')], progress: [newer] }), data({ courses: [course('a')], progress: [older] }), NOW);
  assert.deepEqual(Object.keys(merged.progress[0]?.reports ?? {}), ['q3']);
});

test('reflections: the newer brain dump and the newer explanation are kept separately', () => {
  const a = progress('a', '2026-10-20T10:00:00.000Z', { reflections: { l1: { dump: 'old', dumpAt: '2026-10-01', explain: 'new', explainAt: '2026-10-05' } } });
  const b = progress('a', '2026-10-21T10:00:00.000Z', { reflections: { l1: { dump: 'new', dumpAt: '2026-10-04', explain: 'old', explainAt: '2026-10-02' } } });
  const merged = mergeSyncData(data({ courses: [course('a')], progress: [a] }), data({ courses: [course('a')], progress: [b] }), NOW);
  const r = merged.progress[0]?.reflections?.l1;
  assert.equal(r?.dump, 'new');
  assert.equal(r?.explain, 'new');
});

test('mastery: the newer record per skill and per card, both mistake logs', () => {
  const pc: CourseMastery = {
    courseId: 'a',
    skills: {
      l1: { skillId: 'l1', points: 80, firstTry: {}, updatedAt: '2026-10-21T00:00:00.000Z' },
      l2: { skillId: 'l2', points: 10, firstTry: {}, updatedAt: '2026-10-10T00:00:00.000Z' }
    },
    mistakes: [{ questionId: 'q1', skillId: 'l1', moduleId: 'm1', given: 'x', correct: false, at: '2026-10-21T00:00:00.000Z' }],
    cards: { q1: { questionId: 'q1', skillId: 'l1', due: '2026-10-25', stability: 3, difficulty: 5, scheduledDays: 3, reps: 2, lapses: 0, state: 2, lastReview: '2026-10-21' } },
    updatedAt: '2026-10-21T00:00:00.000Z'
  };
  const phone: CourseMastery = {
    courseId: 'a',
    skills: { l2: { skillId: 'l2', points: 50, firstTry: {}, updatedAt: '2026-10-22T00:00:00.000Z' } },
    mistakes: [{ questionId: 'q2', skillId: 'l2', moduleId: 'm1', given: 'y', correct: false, at: '2026-10-22T00:00:00.000Z' }],
    cards: { q1: { questionId: 'q1', skillId: 'l1', due: '2026-10-23', stability: 1, difficulty: 6, scheduledDays: 1, reps: 1, lapses: 0, state: 1, lastReview: '2026-10-19' } },
    updatedAt: '2026-10-22T00:00:00.000Z'
  };
  const merged = mergeSyncData(data({ courses: [course('a')], mastery: [pc] }), data({ courses: [course('a')], mastery: [phone] }), NOW);
  const m = merged.mastery[0] as CourseMastery;
  assert.equal(m.skills.l1?.points, 80);
  assert.equal(m.skills.l2?.points, 50);
  assert.deepEqual(m.mistakes.map((e) => e.questionId), ['q1', 'q2']);
  assert.equal(m.cards?.q1?.reps, 2);
});

test('a newer course version wins, and for the same version the copy saved last', () => {
  const merged = mergeSyncData(data({ courses: [course('a', 1, 'old')] }), data({ courses: [course('a', 2, 'new')] }), NOW);
  assert.equal(merged.courses[0]?.title, 'new');
  const sameVersion = mergeSyncData(
    data({ courses: [course('a', 1, 'pc')], courseMeta: [{ courseId: 'a', savedAt: '2026-10-20T00:00:00.000Z' }] }),
    data({ courses: [course('a', 1, 'phone')], courseMeta: [{ courseId: 'a', savedAt: '2026-10-22T00:00:00.000Z' }] }),
    NOW
  );
  assert.equal(sameVersion.courses[0]?.title, 'phone');
});

test('deleting a course on one device removes it on the other, with its progress kept in the trash', () => {
  const phone = data({ courses: [course('a')], progress: [progress('a', '2026-10-20T10:00:00.000Z', { completedLessons: ['l1'] })] });
  const pc = data({ trash: [{ courseId: 'a', course: course('a'), deletedAt: '2026-10-22T10:00:00.000Z' }] });
  const merged = mergeSyncData(phone, pc, NOW);
  assert.equal(merged.courses.length, 0);
  assert.equal(merged.progress.length, 0);
  assert.equal(merged.trash.length, 1);
  assert.deepEqual(merged.trash[0]?.progress?.completedLessons, ['l1']);
});

test('studying a course after it was deleted on the other device brings it back', () => {
  const phone = data({ courses: [course('a')], progress: [progress('a', '2026-10-23T10:00:00.000Z')] });
  const pc = data({ trash: [{ courseId: 'a', course: course('a'), deletedAt: '2026-10-22T10:00:00.000Z' }] });
  const merged = mergeSyncData(pc, phone, NOW);
  assert.deepEqual(merged.courses.map((c) => c.id), ['a']);
  assert.equal(merged.trash.length, 0);
});

test('a restored course beats the older delete still in the other copy', () => {
  const pc = data({ courses: [course('a')], courseMeta: [{ courseId: 'a', updatedAt: '2026-10-23T08:00:00.000Z' }] });
  const phone = data({ trash: [{ courseId: 'a', course: course('a'), deletedAt: '2026-10-22T10:00:00.000Z' }] });
  assert.equal(mergeSyncData(phone, pc, NOW).courses.length, 1);
});

test('trash items past the grace period are dropped', () => {
  const merged = mergeSyncData(data({ trash: [{ courseId: 'a', course: course('a'), deletedAt: '2026-01-01T00:00:00.000Z' }] }), empty(), NOW);
  assert.equal(merged.trash.length, 0);
});

test('activity keeps the larger count per day instead of adding them up', () => {
  const merged = mergeSyncData(
    data({ activity: [{ day: '2026-10-22', correct: 5, lessons: 1, xp: 55 }] }),
    data({ activity: [{ day: '2026-10-22', correct: 3, lessons: 2, xp: 40 }, { day: '2026-10-21', correct: 1, lessons: 0, xp: 10 }] }),
    NOW
  );
  assert.deepEqual(merged.activity, [
    { day: '2026-10-21', correct: 1, lessons: 0, xp: 10 },
    { day: '2026-10-22', correct: 5, lessons: 2, xp: 55 }
  ]);
});

test('settings: the newer change wins, but each device keeps its own text size', () => {
  const pc = data({ settings: { ...defaultSettings(), fontSize: 18, theme: 'dark', changedAt: '2026-10-22T00:00:00.000Z' } });
  const phone = data({ settings: { ...defaultSettings(), fontSize: 15, theme: 'light', changedAt: '2026-10-20T00:00:00.000Z' } });
  const onPhone = mergeSyncData(phone, pc, NOW);
  assert.equal(onPhone.settings.theme, 'dark');
  assert.equal(onPhone.settings.fontSize, 15);
});

function game(id: string, moves: string[], patch: Partial<SavedGame> = {}): SavedGame {
  return { id, botId: 'bot', color: 'w', startFen: 'start', moves, startedAt: '2026-10-20T00:00:00.000Z', ...patch };
}

test('chess: games from both sides, the finished copy wins, a game deleted for good stays deleted', () => {
  const pc = data({ games: [game('g1', ['e2e4']), game('g2', ['d2d4'])], tombstones: { 'game:g2': '2026-10-22T00:00:00.000Z' } });
  const phone = data({ games: [game('g1', ['e2e4', 'e7e5'], { result: 'won' }), game('g2', ['d2d4']), game('g3', [])] });
  const merged = mergeSyncData(pc, phone, NOW);
  assert.deepEqual(merged.games.map((g) => g.id), ['g1', 'g3']);
  assert.equal(merged.games[0]?.result, 'won');
});

test('chess endgames and drills keep the best of both', () => {
  const merged = mergeSyncData(
    data({ chess: { endgames: { kq: { done: true, bestMoves: 12, at: '2026-10-20' } } }, drills: { bin: { solved: 10, best: 3, level: 2 } } }),
    data({ chess: { endgames: { kq: { done: true, bestMoves: 9, at: '2026-10-21' }, kr: { done: false, at: '2026-10-19' } } }, drills: { bin: { solved: 4, best: 7 }, hex: { solved: 1, best: 1 } } }),
    NOW
  );
  assert.deepEqual(merged.chess.endgames.kq, { done: true, bestMoves: 9, at: '2026-10-21' });
  assert.ok(merged.chess.endgames.kr);
  assert.deepEqual(merged.drills.bin, { solved: 10, best: 7, level: 2 });
  assert.ok(merged.drills.hex);
});

test('milestones keep the earliest date they were earned', () => {
  const merged = mergeSyncData(data({ milestones: { m1: '2026-10-05' } }), data({ milestones: { m1: '2026-10-01', m2: '2026-10-03' } }), NOW);
  assert.deepEqual(merged.milestones, { m1: '2026-10-01', m2: '2026-10-03' });
});

test('merging is stable: syncing again changes nothing', () => {
  const pc = data({
    courses: [course('a'), course('b')],
    progress: [progress('a', '2026-10-20T10:00:00.000Z', { completedLessons: ['l1'] })],
    activity: [{ day: '2026-10-22', correct: 5, lessons: 1, xp: 55 }]
  });
  const phone = data({ courses: [course('a')], progress: [progress('a', '2026-10-21T10:00:00.000Z', { completedLessons: ['l2'] })] });
  const once = mergeSyncData(pc, phone, NOW);
  assert.ok(sameData(mergeSyncData(once, once, NOW), once));
  assert.ok(sameData(mergeSyncData(once, phone, NOW), once));
  assert.ok(sameData(mergeSyncData(phone, once, NOW), once));
});

test('parseSyncFile reads a file written by this app and refuses one from a newer app', () => {
  const file = { kind: 'courseify-sync', formatVersion: SYNC_FORMAT_VERSION, updatedAt: 'x', deviceId: 'd', data: data({ courses: [course('a')] }) };
  const parsed = parseSyncFile(JSON.stringify(file));
  assert.ok(parsed.ok);
  if (parsed.ok) assert.equal(parsed.file.data.courses[0]?.id, 'a');
  const newer = parseSyncFile(JSON.stringify({ ...file, formatVersion: SYNC_FORMAT_VERSION + 1 }));
  assert.deepEqual(newer, { ok: false, reason: 'newer' });
  assert.deepEqual(parseSyncFile('not json'), { ok: false, reason: 'format' });
});

test('reading back an uploaded file gives the same data, so two devices never keep re-uploading', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { validateCourse } = await import('./validate.ts');
  const dir = new URL('../../courses/', import.meta.url);
  const courses = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => validateCourse(JSON.parse(readFileSync(new URL(f, dir), 'utf8'))).course as Course);
  const local = syncDataFrom({ kind: 'course-app-backup', schemaVersion: 3, exportedAt: 'x', ...data({
    courses,
    progress: [progress(courses[0]!.id, '2026-10-20T10:00:00.000Z', { completedLessons: ['x'], bookmarks: ['y'], reflections: { x: { dump: 'd', dumpAt: '2026-10-20' } } })],
    courseMeta: [{ courseId: courses[0]!.id, savedAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T10:00:00.000Z', tags: ['a'] }],
    settings: { ...defaultSettings(), changedAt: '2026-10-20T10:00:00.000Z', theme: 'dark' },
    activity: [{ day: '2026-10-22', correct: 5, lessons: 1, xp: 55 }],
    games: [game('g1', ['e2e4'], { result: 'won', reason: 'mate', finishedAt: '2026-10-21' })],
    drills: { bin: { solved: 3, best: 2, level: 1 } },
    milestones: { m1: '2026-10-01' },
  }) }, { drills: { bin: { solved: 3, best: 2, level: 1 } }, milestones: { m1: '2026-10-01' }, tombstones: { 'game:g9': '2026-10-20T00:00:00.000Z' } });
  const file = { kind: 'courseify-sync', formatVersion: SYNC_FORMAT_VERSION, userDataVersion: 3, updatedAt: 'x', deviceId: 'd', data: local };
  const parsed = parseSyncFile(JSON.stringify(file));
  assert.ok(parsed.ok);
  if (parsed.ok) assert.ok(sameData(parsed.file.data, local));
});

test('a merged copy also reads back unchanged', () => {
  const a = syncDataFrom({ kind: 'course-app-backup', schemaVersion: 3, exportedAt: 'x', ...data({ courses: [course('a')], progress: [progress('a', '2026-10-20T10:00:00.000Z', { completedLessons: ['l1'], notes: { l1: 'n' } })] }) }, {});
  const b = syncDataFrom({ kind: 'course-app-backup', schemaVersion: 3, exportedAt: 'x', ...data({ courses: [course('a'), course('b')], progress: [progress('a', '2026-10-21T10:00:00.000Z', { bookmarks: ['l2'], reports: { q: { reason: 'typo', at: '2026-10-21T09:00:00.000Z' } } })] }) }, {});
  const merged = mergeSyncData(a, b, NOW);
  const parsed = parseSyncFile(JSON.stringify({ kind: 'courseify-sync', formatVersion: SYNC_FORMAT_VERSION, userDataVersion: 3, data: merged }));
  assert.ok(parsed.ok && sameData(parsed.file.data, merged));
});

test('chess: the bot rating comes from the device with more rated games, keeping the best ever', () => {
  const pc = data({ chess: { endgames: {}, rating: { value: 950, games: 12, peak: 1010 } } });
  const phone = data({ chess: { endgames: {}, rating: { value: 880, games: 5, peak: 1050 } } });
  const merged = mergeSyncData(pc, phone).chess.rating;
  assert.deepEqual(merged, { value: 950, games: 12, peak: 1050 });
  assert.deepEqual(mergeSyncData(data({}), phone).chess.rating, phone.chess.rating);
  assert.equal(mergeSyncData(data({}), data({})).chess.rating, undefined);
});

test('mastery: a review already cleared here does not come back from the other device', () => {
  const base = { courseId: 'c', skills: {}, mistakes: [] };
  // The other device missed q1 on 1 Oct (next try 2 Oct); this device answered it right on 5 Oct.
  const here = { ...base, updatedAt: '2026-10-05T10:00:00.000Z', reviews: {}, cards: { q1: { lastReview: '2026-10-05T10:00:00.000Z' } } } as unknown as CourseMastery;
  const there = {
    ...base,
    updatedAt: '2026-10-01T10:00:00.000Z',
    reviews: {
      q1: { questionId: 'q1', misses: 1, nextAt: '2026-10-02T10:00:00.000Z' },
      q2: { questionId: 'q2', misses: 1, nextAt: '2026-10-02T10:00:00.000Z' }
    }
  } as unknown as CourseMastery;
  const merged = mergeMastery(here, there);
  assert.equal(merged?.reviews?.q1, undefined);
  assert.ok(merged?.reviews?.q2);
});
