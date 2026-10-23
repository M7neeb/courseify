import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { courseProgressPercent, firstOpenItem, flattenCourse, isNewerVersion, lessonKind, outlineOf } from './course-utils.ts';
import { pruneProgress, newProgress } from './progress.ts';
import type { Course } from './types.ts';

const course = JSON.parse(readFileSync(new URL('../../examples/sample-course.json', import.meta.url), 'utf8')) as Course;

test('flattening orders lessons then the module test', () => {
  const ids = flattenCourse(course).map((i) => i.id);
  assert.deepEqual(ids, ['m1-l1', 'm1-l2', 'm1:test']);
  assert.equal(flattenCourse(course)[2]?.kind, 'test');
});

test('progress percent and the next open item follow completion', () => {
  assert.equal(courseProgressPercent(course, []), 0);
  assert.equal(courseProgressPercent(course, ['m1-l1']), 33);
  assert.equal(courseProgressPercent(course, ['m1-l1', 'm1-l2', 'm1:test']), 100);
  assert.equal(firstOpenItem(course, ['m1-l1'])?.id, 'm1-l2');
  assert.equal(firstOpenItem(course, ['m1-l1', 'm1-l2', 'm1:test']), undefined);
});

test('the outline keeps ids and goals but no content', () => {
  const o = JSON.parse(outlineOf(course));
  assert.equal(o.modules[0].lessons[0].id, 'm1-l1');
  assert.equal(JSON.stringify(o).includes('levels'), false);
});

test('pruning drops completed ids that vanished and keeps answers', () => {
  const p = newProgress('networking-basics');
  p.completedLessons = ['m1-l1', 'gone'];
  p.answers['q-m1-l1-1'] = { given: 1, correct: true, at: 'now', attempts: 1 };
  const out = pruneProgress(course, p, ['m1-l1']);
  assert.deepEqual(out.completedLessons, ['m1-l1']);
  assert.ok(out.answers['q-m1-l1-1']);
});

test('a lesson type is video, then exercise, then article', () => {
  assert.equal(lessonKind({ id: 'l', title: 'L', blocks: [{ id: 'b', type: 'video', url: 'https://youtu.be/UjOXLg7HauQ' }] }), 'video');
  assert.equal(lessonKind({ id: 'l', title: 'L', blocks: [{ id: 'b', type: 'video', searchTerm: 'only a search term' }] }), 'article');
  assert.equal(lessonKind({ id: 'l', title: 'L', blocks: [{ id: 'b', type: 'quiz' }] }), 'exercise');
  assert.equal(
    lessonKind({ id: 'l', title: 'L', blocks: [{ id: 'b', type: 'text' }, { id: 'c', type: 'callout' }] }),
    'article'
  );
  assert.equal(lessonKind({ id: 'l', title: 'L', blocks: [{ id: 'b', type: 'video', url: 'https://youtu.be/UjOXLg7HauQ' }, { id: 'c', type: 'quiz' }] }), 'video');
});

test('isNewerVersion: only a higher catalog version counts as an update', () => {
  assert.equal(isNewerVersion('1.1', 1), true);
  assert.equal(isNewerVersion('1.1', 1.1), false);
  assert.equal(isNewerVersion('1.0', 1.1), false);
  assert.equal(isNewerVersion('1.0', undefined), true);
  assert.equal(isNewerVersion('not a number', 1), false);
});
