import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer, multiSelectOutcome, normalizeText, parseNumeric } from './grade.ts';
import type { Question } from './types.ts';

const q = (partial: Partial<Question>): Question =>
  ({ id: 'q', kind: 'short-answer', prompt: 'p', answer: 'x', ...partial }) as Question;

test('multiple choice compares the option index', () => {
  const mc = q({ kind: 'multiple-choice', options: ['a', 'b'], answer: 1 });
  assert.equal(gradeAnswer(mc, 1), true);
  assert.equal(gradeAnswer(mc, 0), false);
  assert.equal(gradeAnswer(mc, '1'), false);
});

test('true-false compares booleans', () => {
  const tf = q({ kind: 'true-false', answer: true });
  assert.equal(gradeAnswer(tf, true), true);
  assert.equal(gradeAnswer(tf, false), false);
});

test('text answers ignore case, spacing and trailing punctuation', () => {
  const sa = q({ answer: ['Internet Protocol'] });
  assert.equal(gradeAnswer(sa, '  internet   protocol. '), true);
  assert.equal(gradeAnswer(sa, 'Internet Protocols'), false);
  assert.equal(gradeAnswer(sa, ''), false);
});

test('any accepted answer counts and umlauts survive', () => {
  const sa = q({ answer: ['Schlüssel', 'Key'] });
  assert.equal(gradeAnswer(sa, 'KEY'), true);
  assert.equal(gradeAnswer(sa, 'schlüssel'), true);
  assert.equal(gradeAnswer(sa, 'schlussel'), false);
});

test('normalizeText is stable', () => {
  assert.equal(normalizeText('  A  b!! '), 'a b');
});

// ---------- numeric ----------

test('parseNumeric tolerates whitespace, a leading + and either separator', () => {
  assert.equal(parseNumeric(' 42 '), 42);
  assert.equal(parseNumeric('+7'), 7);
  assert.equal(parseNumeric('3,5'), 3.5);
  assert.equal(parseNumeric('3.5'), 3.5);
  assert.equal(parseNumeric('-0.25'), -0.25);
  assert.equal(parseNumeric('.5'), 0.5);
  assert.equal(parseNumeric(12.5), 12.5);
  assert.equal(parseNumeric(''), null);
  assert.equal(parseNumeric('1,5.5'), null);
  assert.equal(parseNumeric('abc'), null);
  assert.equal(parseNumeric('3 apples'), null);
  assert.equal(parseNumeric(true), null);
  assert.equal(parseNumeric(Number.NaN), null);
});

test('numeric matches a number and accepts comma or dot', () => {
  const n = q({ kind: 'numeric', answer: 3.5 });
  assert.equal(gradeAnswer(n, '3.5'), true);
  assert.equal(gradeAnswer(n, '3,5'), true);
  assert.equal(gradeAnswer(n, '  +3.50 '), true);
  assert.equal(gradeAnswer(n, 3.5), true);
  assert.equal(gradeAnswer(n, '3.6'), false);
  assert.equal(gradeAnswer(n, 'abc'), false);
  assert.equal(gradeAnswer(n, ''), false);
});

test('numeric without a tolerance needs an exact match', () => {
  const n = q({ kind: 'numeric', answer: 42 });
  assert.equal(gradeAnswer(n, '42'), true);
  assert.equal(gradeAnswer(n, '42.0'), true);
  assert.equal(gradeAnswer(n, '42.000001'), false);
});

test('numeric honours an optional tolerance on both sides', () => {
  const n = q({ kind: 'numeric', answer: 10, tolerance: 0.5 });
  assert.equal(gradeAnswer(n, '10.4'), true);
  assert.equal(gradeAnswer(n, '10,5'), true);
  assert.equal(gradeAnswer(n, '9.5'), true);
  assert.equal(gradeAnswer(n, '10.51'), false);
  assert.equal(gradeAnswer(n, '9.49'), false);
});

// ---------- multi-select ----------

test('multi-select needs exactly the correct set of options', () => {
  const m = q({ kind: 'multi-select', options: ['a', 'b', 'c', 'd'], answer: [0, 2] });
  assert.equal(gradeAnswer(m, [0, 2]), true);
  assert.equal(gradeAnswer(m, [2, 0]), true); // order does not matter
  assert.equal(gradeAnswer(m, [0]), false);
  assert.equal(gradeAnswer(m, [0, 1, 2]), false);
  assert.equal(gradeAnswer(m, [1, 2]), false);
  assert.equal(gradeAnswer(m, []), false);
  assert.equal(gradeAnswer(m, '0,2'), false);
});

test('multiSelectOutcome separates a partial pick from a wrong one', () => {
  const m = q({ kind: 'multi-select', options: ['a', 'b', 'c', 'd'], answer: [0, 2] });
  assert.equal(multiSelectOutcome(m, [0, 2]), 'correct');
  assert.equal(multiSelectOutcome(m, [0]), 'partial');
  assert.equal(multiSelectOutcome(m, [2]), 'partial');
  assert.equal(multiSelectOutcome(m, [0, 1]), 'incorrect');
  assert.equal(multiSelectOutcome(m, [1]), 'incorrect');
  assert.equal(multiSelectOutcome(m, []), 'incorrect');
});

// ---------- matching ----------

test('matching is correct only when every pair is matched', () => {
  const m = q({
    kind: 'matching',
    pairs: [
      { left: 'A', right: '1' },
      { left: 'B', right: '2' },
      { left: 'C', right: '3' }
    ]
  });
  assert.equal(gradeAnswer(m, [0, 1, 2]), true);
  assert.equal(gradeAnswer(m, [0, 2, 1]), false);
  assert.equal(gradeAnswer(m, [1, 1, 2]), false);
  assert.equal(gradeAnswer(m, [0, 1]), false);
  assert.equal(gradeAnswer(m, [0, 1, 3]), false);
});

// ---------- ordering ----------

test('ordering compares the final order to the canonical order', () => {
  const o = q({ kind: 'ordering', items: ['first', 'second', 'third'] });
  assert.equal(gradeAnswer(o, [0, 1, 2]), true);
  assert.equal(gradeAnswer(o, [1, 0, 2]), false);
  assert.equal(gradeAnswer(o, [2, 1, 0]), false);
  assert.equal(gradeAnswer(o, [0, 1]), false);
  assert.equal(gradeAnswer(o, [0, 1, 2, 3]), false);
});

test('a written answer counts when two thirds of the key points are ticked', async () => {
  const { writtenNeeded, writtenCovered } = await import('./grade.ts');
  const w = q({ kind: 'written', answer: 'model', points: ['a', 'b', 'c', 'd'] });
  assert.equal(writtenNeeded(w), 3);
  assert.equal(gradeAnswer(w, { text: 'my answer', covered: [0, 1, 3] }), true);
  assert.equal(gradeAnswer(w, { text: 'my answer', covered: [0, 1] }), false);
  // Ticks without any text, repeated or out-of-range ticks do not count.
  assert.equal(gradeAnswer(w, { text: '  ', covered: [0, 1, 2] }), false);
  assert.deepEqual(writtenCovered(w, { text: 'x', covered: [1, 1, 9, -1, 2] }), [1, 2]);
});

test('a hotspot answer is right when the tap lands in the right area', async () => {
  const { hotspotHit } = await import('./grade.ts');
  const h = q({ kind: 'hotspot', svg: '<svg></svg>', answer: 1, areas: [{ x: 0, y: 0, w: 50, h: 50 }, { x: 60, y: 60, w: 20, h: 20 }] });
  assert.equal(gradeAnswer(h, { x: 70, y: 70 }), true);
  assert.equal(gradeAnswer(h, { x: 10, y: 10 }), false);
  // A finger is allowed to land just outside the edge.
  assert.equal(gradeAnswer(h, { x: 59, y: 70 }), true);
  assert.equal(gradeAnswer(h, 'tap'), false);
  // Overlapping areas: the smaller one wins.
  assert.equal(hotspotHit([{ x: 0, y: 0, w: 100, h: 100 }, { x: 40, y: 40, w: 10, h: 10 }], 45, 45), 1);
});

test('numbers with German thousands dots count, and umlauts can be typed as ae/oe/ue/ss', () => {
  const big = q({ kind: 'numeric', answer: 349000 });
  assert.equal(gradeAnswer(big, '349.000'), true);
  assert.equal(gradeAnswer(big, '349000'), true);
  assert.equal(gradeAnswer(q({ kind: 'numeric', answer: 74400000 }), '74.400.000'), true);
  assert.equal(gradeAnswer(q({ kind: 'numeric', answer: 1234.5 }), '1.234,5'), true);
  assert.equal(gradeAnswer(q({ kind: 'numeric', answer: 1.5 }), '1,5'), true);
  assert.equal(gradeAnswer(big, '349'), false);
  assert.equal(gradeAnswer(q({ answer: 'Schlüssel' }), 'Schluessel'), true);
  assert.equal(gradeAnswer(q({ answer: 'Straße' }), 'strasse'), true);
});
