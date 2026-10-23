import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RENDERED_BLOCK_TYPES, validateCourse } from './validate.ts';

const sample = JSON.parse(readFileSync(new URL('../../examples/sample-course.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(sample);

test('the sample course is valid', () => {
  const r = validateCourse(sample);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(r.warnings.length, 0, r.warnings.join('\n'));
});

test('flashcard blocks validate and are supported', () => {
  const c = clone();
  c.modules[0].lessons[0].blocks.push({ id: 'x-flash', type: 'flashcards', cards: [{ front: 'TCP', back: 'Reliable transport protocol' }] });
  const r = validateCourse(c);
  assert.equal(r.ok, true);
  assert.equal(r.warnings.some((w) => w.includes('flashcards')), false);
});

test('flashcards require non-empty front and back text', () => {
  const c = clone();
  c.modules[0].lessons[0].blocks.push({ id: 'x-flash', type: 'flashcards', cards: [{ front: '', back: 'Answer' }] });
  const r = validateCourse(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('cards[0].front')));
});

test('unknown extra fields are ignored', () => {
  const c = clone();
  c.futureFeature = { a: 1 };
  c.modules[0].lessons[0].somethingNew = true;
  assert.equal(validateCourse(c).ok, true);
});

test('unknown block types are warnings, not errors', () => {
  const c = clone();
  c.modules[0].lessons[0].blocks.push({ id: 'x1', type: 'hologram' });
  const r = validateCourse(c);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes('hologram')));
});

test('outline stubs without blocks are accepted and get an empty list', () => {
  const r = validateCourse({
    schemaVersion: 1, id: 'c', title: 'C',
    modules: [{ id: 'm1', title: 'M', lessons: [{ id: 'l1', title: 'L', goal: 'g' }] }]
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.course?.modules[0]?.lessons[0]?.blocks, []);
});

test('reports a missing id and a bad title with paths', () => {
  const c = clone();
  delete c.id;
  c.modules[0].title = '';
  const r = validateCourse(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith('id:')));
  assert.ok(r.errors.some((e) => e.startsWith('modules[0].title')));
});

test('duplicate lesson ids and duplicate question ids are rejected', () => {
  const c = clone();
  c.modules[0].lessons[1].id = 'm1-l1';
  c.modules[0].lessons[1].blocks[3].questions[0].id = 'q-m1-l1-1';
  const r = validateCourse(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('duplicate lesson id')));
  assert.ok(r.errors.some((e) => e.includes('duplicate question id')));
});

test('multiple-choice answer must be a valid option index', () => {
  const c = clone();
  c.modules[0].lessons[0].blocks[3].questions[0].answer = 9;
  const r = validateCourse(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('answer')));
});

test('true-false needs a boolean and short-answer needs text', () => {
  const c = clone();
  c.modules[0].lessons[0].blocks[3].questions[1].answer = 'yes';
  c.modules[0].lessons[1].blocks[3].questions[2].answer = [];
  const r = validateCourse(c);
  assert.equal(r.ok, false);
  assert.equal(r.errors.filter((e) => e.includes('.answer')).length, 2);
});

test('a module test must have type module-test', () => {
  const c = clone();
  c.modules[0].test.type = 'quiz';
  assert.equal(validateCourse(c).ok, false);
});

test('non-objects are rejected without throwing', () => {
  for (const v of [null, 5, 'x', [], undefined]) assert.equal(validateCourse(v).ok, false);
});

test('validation does not mutate its input', () => {
  const c = { schemaVersion: 1, id: 'c', title: 'C', modules: [{ id: 'm', title: 'M', lessons: [{ id: 'l', title: 'L' }] }] };
  validateCourse(c);
  assert.equal('blocks' in c.modules[0]!.lessons[0]!, false);
});

// ---------- the new question kinds ----------

/** A clone of the sample course with one extra quiz block carrying these questions. */
function quizWith(questions: unknown[]) {
  const c = clone();
  c.modules[0].lessons[0].blocks.push({ id: 'x-new-quiz', type: 'quiz', questions });
  return c;
}

test('numeric questions require a number answer and a numeric tolerance', () => {
  const good = quizWith([{ id: 'n1', kind: 'numeric', prompt: 'How many bits?', answer: 32, tolerance: 0.5 }]);
  const ok = validateCourse(good);
  assert.equal(ok.ok, true, ok.errors.join('\n'));

  const r = validateCourse(quizWith([{ id: 'n2', kind: 'numeric', prompt: 'p', answer: 'x', tolerance: 'lots' }]));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('.answer: must be a number')));
  assert.ok(r.errors.some((e) => e.includes('.tolerance: must be a number')));
});

test('numeric tolerance must not be negative', () => {
  const r = validateCourse(quizWith([{ id: 'n3', kind: 'numeric', prompt: 'p', answer: 1, tolerance: -1 }]));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('.tolerance: must not be negative')));
});

test('multi-select needs options and in-range, unique answer indexes', () => {
  const good = quizWith([{ id: 'ms1', kind: 'multi-select', prompt: 'p', options: ['a', 'b', 'c'], answer: [0, 2] }]);
  assert.equal(validateCourse(good).ok, true);

  const noOptions = validateCourse(quizWith([{ id: 'ms2', kind: 'multi-select', prompt: 'p', options: ['a'], answer: [0] }]));
  assert.equal(noOptions.ok, false);
  assert.ok(noOptions.errors.some((e) => e.includes('.options')));

  const outOfRange = validateCourse(quizWith([{ id: 'ms3', kind: 'multi-select', prompt: 'p', options: ['a', 'b'], answer: [0, 5] }]));
  assert.equal(outOfRange.ok, false);
  assert.ok(outOfRange.errors.some((e) => e.includes('existing option')));

  const repeated = validateCourse(quizWith([{ id: 'ms4', kind: 'multi-select', prompt: 'p', options: ['a', 'b', 'c'], answer: [1, 1] }]));
  assert.equal(repeated.ok, false);
  assert.ok(repeated.errors.some((e) => e.includes('must not repeat')));

  const empty = validateCourse(quizWith([{ id: 'ms5', kind: 'multi-select', prompt: 'p', options: ['a', 'b'], answer: [] }]));
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.some((e) => e.includes('list of correct option indexes')));
});

test('matching needs at least two complete pairs', () => {
  const good = quizWith([
    { id: 'mt1', kind: 'matching', prompt: 'p', pairs: [{ left: 'A', right: '1' }, { left: 'B', right: '2' }] }
  ]);
  assert.equal(validateCourse(good).ok, true);

  const missing = validateCourse(quizWith([{ id: 'mt2', kind: 'matching', prompt: 'p' }]));
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((e) => e.includes('.pairs')));

  const incomplete = validateCourse(
    quizWith([{ id: 'mt3', kind: 'matching', prompt: 'p', pairs: [{ left: 'A', right: '1' }, { left: 'B', right: '' }] }])
  );
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.errors.some((e) => e.includes('pairs[1]')));
});

test('ordering needs at least two text items', () => {
  const good = quizWith([{ id: 'or1', kind: 'ordering', prompt: 'p', items: ['first', 'second'] }]);
  assert.equal(validateCourse(good).ok, true);

  const one = validateCourse(quizWith([{ id: 'or2', kind: 'ordering', prompt: 'p', items: ['only'] }]));
  assert.equal(one.ok, false);
  assert.ok(one.errors.some((e) => e.includes('.items')));

  const notText = validateCourse(quizWith([{ id: 'or3', kind: 'ordering', prompt: 'p', items: ['a', 5] }]));
  assert.equal(notText.ok, false);
  assert.ok(notText.errors.some((e) => e.includes('.items')));
});

test('rationales must be a list of text, top-level and per language', () => {
  const good = quizWith([
    { id: 'r1', kind: 'multiple-choice', prompt: 'p', options: ['a', 'b'], answer: 0, rationales: ['nope', 'yes'] }
  ]);
  assert.equal(validateCourse(good).ok, true);

  const bad = validateCourse(
    quizWith([{ id: 'r2', kind: 'multiple-choice', prompt: 'p', options: ['a', 'b'], answer: 0, rationales: 'nope' }])
  );
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes('.rationales')));

  const badI18n = validateCourse(
    quizWith([
      { id: 'r3', kind: 'multiple-choice', prompt: 'p', options: ['a', 'b'], answer: 0, i18n: { de: { rationales: [1] } } }
    ])
  );
  assert.equal(badI18n.ok, false);
  assert.ok(badI18n.errors.some((e) => e.includes('i18n.de.rationales')));
});

test('a course using only the original kinds still validates unchanged', () => {
  const r = validateCourse(clone());
  assert.equal(r.ok, true, r.errors.join('\n'));
});

// ---------- image blocks ----------

test('image is a rendered block type', () => {
  assert.ok(RENDERED_BLOCK_TYPES.includes('image'));
});

test('image blocks validate with a search term and localized text', () => {
  const c = clone();
  c.modules[0].lessons[0].blocks.push({
    id: 'x-img',
    type: 'image',
    url: null,
    searchTerm: 'binary place values chart',
    alt: 'Chart of binary place values',
    i18n: { de: { alt: 'Schaubild der Stellenwerte', caption: 'Stellenwerte' }, en: { alt: 'Chart' } }
  });
  const r = validateCourse(c);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(r.warnings.some((w) => w.includes('image')), false);
});

test('image blocks also validate with a real url and no search term', () => {
  const c = clone();
  c.modules[0].lessons[0].blocks.push({ id: 'x-img-url', type: 'image', url: 'https://example.com/diagram.png' });
  const r = validateCourse(c);
  assert.equal(r.ok, true, r.errors.join('\n'));
});

test('an image block needs a url or a search term', () => {
  const c = clone();
  c.modules[0].lessons[0].blocks.push({ id: 'x-img-empty', type: 'image', alt: 'x' });
  const r = validateCourse(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('image block needs')));
});

test('image alt and caption must be text when present', () => {
  const c = clone();
  c.modules[0].lessons[0].blocks.push({ id: 'x-img-bad', type: 'image', searchTerm: 'x', caption: 7, i18n: { de: { alt: 5 } } });
  const r = validateCourse(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('.caption: must be text')));
  assert.ok(r.errors.some((e) => e.includes('.i18n.de.alt: must be text')));
});

test('written questions need 2-8 key points and a model answer', () => {
  const ok = validateCourse(quizWith([{ id: 'w1', kind: 'written', prompt: 'Explain', answer: 'Model answer.', points: ['one', 'two'] }]));
  assert.equal(ok.ok, true, ok.errors.join('\n'));
  const noPoints = validateCourse(quizWith([{ id: 'w2', kind: 'written', prompt: 'Explain', answer: 'Model', points: ['only one'] }]));
  assert.ok(noPoints.errors.some((e) => e.includes('points')));
  const noModel = validateCourse(quizWith([{ id: 'w3', kind: 'written', prompt: 'Explain', points: ['a', 'b'] }]));
  assert.ok(noModel.errors.some((e) => e.includes('model answer')));
});

test('hotspot questions need a picture, areas in percent and a valid answer', () => {
  const areas = [{ x: 0, y: 0, w: 40, h: 40 }, { x: 50, y: 50, w: 40, h: 40 }];
  const ok = validateCourse(quizWith([{ id: 'h1', kind: 'hotspot', prompt: 'Tap', svg: '<svg viewBox="0 0 10 10"></svg>', areas, answer: 1 }]));
  assert.equal(ok.ok, true, ok.errors.join('\n'));
  const noPic = validateCourse(quizWith([{ id: 'h2', kind: 'hotspot', prompt: 'Tap', areas, answer: 0 }]));
  assert.ok(noPic.errors.some((e) => e.includes('needs "svg"')));
  const outside = validateCourse(quizWith([{ id: 'h3', kind: 'hotspot', prompt: 'Tap', svg: '<svg></svg>', areas: [{ x: 80, y: 0, w: 40, h: 10 }, areas[0]], answer: 0 }]));
  assert.ok(outside.errors.some((e) => e.includes('areas[0]')));
  const badAnswer = validateCourse(quizWith([{ id: 'h4', kind: 'hotspot', prompt: 'Tap', svg: '<svg></svg>', areas, answer: 2 }]));
  assert.ok(badAnswer.errors.some((e) => e.includes('answer')));
  const notSvg = validateCourse(quizWith([{ id: 'h5', kind: 'hotspot', prompt: 'Tap', svg: '<div></div>', areas, answer: 0 }]));
  assert.ok(notSvg.errors.some((e) => e.includes('SVG markup')));
});

test('drill and graph blocks validate', () => {
  const c = clone();
  c.modules[0].lessons[0].blocks.push(
    { id: 'x-drill', type: 'drill', drill: 'subnet-network', level: 2, count: 5 },
    { id: 'x-graph', type: 'graph', functions: [{ expr: 'a*x^2 + b' }], params: [{ name: 'a', min: -3, max: 3, value: 1 }, { name: 'b', min: -5, max: 5 }], x: [-6, 6], y: [-4, 8] }
  );
  const r = validateCourse(c);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(r.warnings.length, 0, r.warnings.join('\n'));
});

test('a broken drill or graph block is reported', () => {
  const c = clone();
  c.modules[0].lessons[0].blocks.push(
    { id: 'x-drill', type: 'drill', drill: 'juggling', count: 99 },
    { id: 'x-graph', type: 'graph', functions: [{ expr: 'a*x^2 + c' }], params: [{ name: 'x', min: 3, max: 1 }] }
  );
  const r = validateCourse(c);
  assert.equal(r.ok, false);
  for (const part of ['.drill: an unknown drill', '.count:', 'params[0].name', 'params[0]: needs', 'functions[0].expr']) {
    assert.ok(r.errors.some((e) => e.includes(part)), part);
  }
});
