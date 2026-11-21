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

test('glossary terms are found in either language, the ones that start with the words first', async () => {
  const { searchTerms } = await import('./search.ts');
  const course = {
    schemaVersion: 2,
    id: 'et',
    title: 'ET',
    glossary: [
      { term: 'Ohmsches Gesetz', definition: 'U = R · I', i18n: { en: { term: "Ohm's law", definition: 'U = R · I' } } },
      { term: 'Ohm', definition: 'Einheit des **Widerstands**', i18n: { en: { term: 'Ohm', definition: 'unit of resistance' } } },
      { term: 'Leitwert', definition: 'Kehrwert des Widerstands', aliases: ['G'], i18n: { en: { term: 'Conductance', definition: 'one over the resistance' } } }
    ],
    modules: [{ id: 'm1', title: 'U', lessons: [
      { id: 'l1', title: 'Spannung', blocks: [{ id: 'b', type: 'text', levels: { normal: 'Nothing here.' } }] },
      { id: 'l2', title: 'Widerstand', blocks: [{ id: 'c', type: 'text', levels: { normal: 'Der Leitwert ist der Kehrwert.' } }] }
    ] }]
  };
  const ohm = searchTerms([course], 'ohm', 4, () => 'de');
  assert.equal(ohm[0].term, 'Ohm');
  assert.equal(ohm[0].definition, 'Einheit des Widerstands');
  assert.equal(searchTerms([course], 'ohm', 4, () => 'en')[0].definition, 'unit of resistance');
  assert.ok(ohm.some((h) => h.term === 'Ohmsches Gesetz'));
  // One result per term, in the language the course is read in; the other language still finds it.
  assert.ok(!ohm.some((h) => h.term === "Ohm's law"));
  assert.deepEqual(searchTerms([course], 'law', 4, () => 'de').map((h) => h.term), ["Ohm's law"]);
  const conductance = searchTerms([course], 'conduct');
  assert.deepEqual(conductance.map((h) => [h.term, h.lessonId]), [['Conductance', 'l2']]);
  assert.deepEqual(searchTerms([course], 'o'), []);
  assert.deepEqual(searchTerms([course], 'zzz'), []);
});

test('term search over every built-in course stays quick', async () => {
  const { searchTerms } = await import('./search.ts');
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../../courses/', import.meta.url);
  const courses = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
  const started = performance.now();
  for (const q of ['ip', 'widerstand', 'schlüssel', 'sql', 'pr']) searchTerms(courses, q);
  assert.ok(performance.now() - started < 400, `took ${Math.round(performance.now() - started)} ms`);
  assert.ok(searchTerms(courses, 'prim').some((h) => /prim/i.test(h.term)));
});

test('inline formulas read as plain text in results, and dollar amounts are left alone', async () => {
  const { plainText } = await import('./search.ts');
  assert.equal(plainText('Der Kehrwert: $G = \\frac{1}{R}$, Einheit Siemens.'), 'Der Kehrwert: G = 1 / R, Einheit Siemens.');
  assert.equal(plainText('It costs $5 and $10 later.'), 'It costs $5 and $10 later.');
});
