import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseHaystack, courseMatches, plainText, searchLessons } from './search.ts';
import type { Course } from './types.ts';

const course: Course = {
  schemaVersion: 2,
  id: 'c1',
  title: 'Algebra basics',
  subject: 'Maths',
  level: 'Beginner',
  modules: []
};

test('an empty query matches every course', () => {
  assert.equal(courseMatches(course, 'Algebra basics', [], ''), true);
  assert.equal(courseMatches(course, 'Algebra basics', [], '   '), true);
});

test('the query matches title, subject, level or tag, case-insensitively', () => {
  assert.equal(courseMatches(course, 'Algebra basics', [], 'algebra'), true);
  assert.equal(courseMatches(course, 'Algebra basics', [], 'maths'), true);
  assert.equal(courseMatches(course, 'Algebra basics', [], 'BEGINNER'), true);
  assert.equal(courseMatches(course, 'Algebra basics', ['homework'], 'home'), true);
  assert.equal(courseMatches(course, 'Algebra basics', ['homework'], 'geometry'), false);
});

test('the haystack drops blank fields', () => {
  const bare: Course = { schemaVersion: 2, id: 'c2', title: 'Bare', modules: [] };
  assert.deepEqual(courseHaystack(bare, 'Bare', []), ['Bare']);
});

const sql: Course = {
  schemaVersion: 2,
  id: 'sql',
  title: 'SQL',
  modules: [
    {
      id: 'm1',
      title: 'Start',
      lessons: [
        {
          id: 'l1',
          title: 'SELECT and FROM',
          goal: 'Show columns of a table.',
          blocks: [
            { id: 'b1', type: 'text', markdown: 'The **semicolon** ends the question.', i18n: { de: { normal: 'Das Semikolon beendet die Frage.' } } },
            { id: 'b2', type: 'quiz', questions: [{ id: 'q1', kind: 'short-answer', prompt: 'Which keyword sorts?', answer: 'ORDER BY' }] }
          ]
        },
        {
          id: 'l2',
          title: 'Filtering with WHERE',
          blocks: [
            { id: 'b3', type: 'flashcards', cards: [{ front: 'AND', back: 'Both conditions must hold.' }] },
            { id: 'b4', type: 'text', markdown: '```sql\nSELECT secret FROM vault;\n```\n| a | b |\n|---|---|\n| wildcard | 2 |' }
          ]
        }
      ]
    }
  ]
};

test('plain text drops code fences and markdown marks', () => {
  assert.equal(plainText('A **bold** [link](http://x) and `code`\n```js\nhidden()\n```'), 'A bold link and code');
});

test('lesson search finds titles first, then text, with a snippet', () => {
  const hits = searchLessons([sql], 'where');
  assert.deepEqual(hits, [{ courseId: 'sql', lessonId: 'l2', title: 'Filtering with WHERE' }]);
  const text = searchLessons([sql], 'semicolon');
  assert.equal(text.length, 1);
  assert.equal(text[0]?.lessonId, 'l1');
  assert.match(text[0]?.snippet ?? '', /semicolon ends the question/);
});

test('lesson search reads every language, flashcards and tables', () => {
  assert.equal(searchLessons([sql], 'semikolon')[0]?.lessonId, 'l1');
  assert.equal(searchLessons([sql], 'conditions')[0]?.lessonId, 'l2');
  assert.equal(searchLessons([sql], 'wildcard')[0]?.lessonId, 'l2');
});

test('the snippet shows the words together when the text has them together', () => {
  const hit = searchLessons([sql], 'ends the')[0];
  assert.match(hit?.snippet ?? '', /semicolon ends the question/);
});

test('lesson search never looks inside questions or code fences', () => {
  assert.deepEqual(searchLessons([sql], 'ORDER BY'), []);
  assert.deepEqual(searchLessons([sql], 'vault'), []);
});

test('every word has to appear, and one-letter queries find nothing', () => {
  assert.equal(searchLessons([sql], 'select columns').length, 1);
  assert.deepEqual(searchLessons([sql], 'select zebra'), []);
  assert.deepEqual(searchLessons([sql], 'a'), []);
});
