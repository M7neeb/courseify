import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeImport, applyFinalExam, applyModule, parseLooseJson } from './import.ts';
import type { Course } from './types.ts';

const text = readFileSync(new URL('../../examples/sample-course.json', import.meta.url), 'utf8');

test('plain course JSON imports', () => {
  const r = analyzeImport(text);
  assert.equal(r.kind, 'course');
});

test('JSON inside code fences or with chatter around it imports', () => {
  assert.equal(analyzeImport('```json\n' + text + '\n```').kind, 'course');
  assert.equal(analyzeImport('Here is your course:\n' + text + '\nHope it helps!').kind, 'course');
});

test('broken JSON gives a readable error', () => {
  const r = analyzeImport('{"schemaVersion": 1,');
  assert.equal(r.kind, 'error');
  if (r.kind === 'error') assert.ok(r.errors[0]?.startsWith('This is not valid JSON'));
});

test('empty input and non-objects are errors', () => {
  assert.equal(analyzeImport('   ').kind, 'error');
  assert.equal(analyzeImport('[1,2]').kind, 'error');
});

test('invalid courses list validation errors', () => {
  const r = analyzeImport('{"schemaVersion":1,"id":"x","title":"X"}');
  assert.equal(r.kind, 'error');
});

test('a module payload is recognised and merges into a course', () => {
  const base = JSON.parse(text) as Course;
  const mod = structuredClone(base.modules[0]!);
  mod.id = 'm2';
  mod.title = 'Second module';
  mod.lessons = mod.lessons.map((l) => ({ ...l, id: l.id + '-b', blocks: [] }));
  delete mod.test;
  const a = analyzeImport(JSON.stringify({ module: mod }));
  assert.equal(a.kind, 'module');
  if (a.kind !== 'module') return;
  const merged = applyModule(base, a.module);
  assert.equal(merged.ok, true, merged.errors.join('\n'));
  assert.equal(merged.course?.modules.length, 2);
});

test('replacing a module with the same id keeps the count; clashing ids are caught', () => {
  const base = JSON.parse(text) as Course;
  const same = structuredClone(base.modules[0]!);
  assert.equal(applyModule(base, same).course?.modules.length, 1);
  const clash = structuredClone(base.modules[0]!);
  clash.id = 'm9';
  assert.equal(applyModule(base, clash).ok, false);
});

test('backups are detected, validated and normalised', () => {
  const backup = {
    kind: 'course-app-backup', schemaVersion: 1, exportedAt: '2026-10-10T00:00:00Z',
    courses: [JSON.parse(text)],
    progress: [{ courseId: 'networking-basics', completedLessons: ['m1-l1', 5] }, { nope: true }],
    courseMeta: [{ courseId: 'networking-basics', archived: true }],
    settings: { theme: 'dark', fontSize: 999 }
  };
  const r = analyzeImport(JSON.stringify(backup));
  assert.equal(r.kind, 'backup');
  if (r.kind !== 'backup') return;
  assert.equal(r.backup.progress.length, 1);
  assert.deepEqual(r.backup.progress[0]?.completedLessons, ['m1-l1']);
  assert.equal(r.backup.settings.theme, 'dark');
  assert.equal(r.backup.settings.fontSize, 17);
});

test('backups keep activity days, chess games and endgame records', () => {
  const backup = {
    kind: 'course-app-backup', schemaVersion: 3, exportedAt: '2026-10-22T00:00:00Z',
    courses: [], progress: [], courseMeta: [], settings: {},
    activity: [{ day: '2026-10-21', xp: 40 }, { nope: 1 }],
    games: [{ id: 'g1', botId: 'pip', color: 'w', startFen: 'x', moves: ['e2e4'], startedAt: '2026-10-21' }, { id: 'broken' }],
    chess: { endgames: { 'kq-k': { done: true, bestMoves: 9, at: '2026-10-21' } } }
  };
  const r = analyzeImport(JSON.stringify(backup));
  assert.equal(r.kind, 'backup');
  if (r.kind !== 'backup') return;
  assert.equal(r.backup.activity?.length, 1);
  assert.equal(r.backup.games?.length, 1);
  assert.equal(r.backup.chess?.endgames['kq-k']?.bestMoves, 9);
});

test('parseLooseJson reports failure for text with no object', () => {
  assert.equal(parseLooseJson('hello').ok, false);
});

test('a module payload carries the course id it was written for', () => {
  const base = JSON.parse(text) as Course;
  const a = analyzeImport(JSON.stringify({ courseId: base.id, module: base.modules[0] }));
  assert.equal(a.kind, 'module');
  if (a.kind === 'module') assert.equal(a.courseId, base.id);
});

test('a final exam payload is recognised and merges into its course', () => {
  const base = JSON.parse(text) as Course;
  const exam = {
    id: 'final-exam',
    type: 'final-exam',
    questions: [{ id: 'q-final-new-1', kind: 'true-false', prompt: 'A final question?', answer: true }]
  };
  const a = analyzeImport(JSON.stringify({ courseId: base.id, finalExam: exam }));
  assert.equal(a.kind, 'exam');
  if (a.kind !== 'exam') return;
  assert.equal(a.courseId, base.id);
  const merged = applyFinalExam(base, a.exam);
  assert.equal(merged.ok, true, merged.errors.join('\n'));
  assert.equal((merged.course?.finalExam?.questions as unknown[] | undefined)?.length, 1);

  const broken = analyzeImport(JSON.stringify({ finalExam: { id: 'final-exam', type: 'quiz', questions: [] } }));
  assert.equal(broken.kind, 'error');
});
