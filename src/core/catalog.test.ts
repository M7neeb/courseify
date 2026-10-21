import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { validateCourse } from './validate.ts';
import { CATALOG_INFO } from './catalogEntries.ts';
import type { Course } from './types.ts';

// Every course file in courses/ comes with the app: it needs an entry in catalogEntries.ts that
// still matches the file, and it must pass the importer.
const dir = new URL('../../courses/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const courses = files.map((f) => ({ file: f, course: JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as Course }));

test('every course file has a catalog entry, and every entry has a file', () => {
  assert.deepEqual(
    files.map((f) => f.replace(/\.json$/, '')).sort(),
    CATALOG_INFO.map((e) => e.id).sort()
  );
});

test('catalog entries match their course files', () => {
  for (const { file, course } of courses) {
    const entry = CATALOG_INFO.find((e) => e.id === course.id);
    assert.ok(entry, `${file}: its id ${course.id} has no catalog entry (the file must be named <id>.json)`);
    assert.equal(`${course.id}.json`, file);
    assert.equal(entry.title, course.title, `${file}: title`);
    assert.equal(entry.version, String(course.version ?? ''), `${file}: version`);
    assert.equal(entry.lessons, course.modules.reduce((n, m) => n + m.lessons.length, 0), `${file}: lesson count`);
  }
});

test('every course that comes with the app passes the importer', () => {
  for (const { file, course } of courses) {
    const result = validateCourse(course);
    assert.equal(result.ok, true, `${file}: ${result.errors.slice(0, 5).join('\n')}`);
  }
});
