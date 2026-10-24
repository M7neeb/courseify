import test from 'node:test';
import assert from 'node:assert/strict';
import { hiddenSteps, splitWorked } from './worked.ts';

const MD = `Solve 2x + 3 = 11.

1. Subtract 3 from both sides: 2x = 8.
2. Divide both sides by 2:
   x = 4.
3. Check: 2 * 4 + 3 = 11.

So x = 4.`;

test('a numbered solution is split into before, steps and after', () => {
  const s = splitWorked(MD)!;
  assert.equal(s.before.trim(), 'Solve 2x + 3 = 11.');
  assert.equal(s.steps.length, 3);
  assert.ok(s.steps[1].startsWith('2. Divide') && s.steps[1].includes('x = 4.'));
  assert.equal(s.after, 'So x = 4.');
  assert.equal(splitWorked('No list here.'), null);
});

test('loose lists with blank lines between items stay one list', () => {
  const s = splitWorked('1. one\n\n2. two\n\n3. three')!;
  assert.deepEqual(s.steps, ['1. one', '2. two', '3. three']);
  assert.equal(s.after, '');
});

test('steps fade with the level, keep the first step, and switch off at Mastered', () => {
  assert.equal(hiddenSteps(5, 'not-started'), 0);
  assert.equal(hiddenSteps(5, 'attempted'), 1);
  assert.equal(hiddenSteps(5, 'familiar'), 2);
  assert.equal(hiddenSteps(5, 'proficient'), 3);
  assert.equal(hiddenSteps(5, 'mastered'), 0);
  assert.equal(hiddenSteps(3, 'proficient'), 2);
  assert.equal(hiddenSteps(2, 'proficient'), 0);
});
