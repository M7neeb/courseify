import test from 'node:test';
import assert from 'node:assert/strict';
import { autoPretest } from './pretest.ts';
import type { Block } from './types.ts';

const q = (id: string, kind = 'multiple-choice') => ({ id, kind, prompt: id, options: ['a', 'b'], answer: 'a' });
const quiz = (id: string, questions: unknown[], extra: Record<string, unknown> = {}): Block => ({ id, type: 'quiz', questions, ...extra });

test('a lesson with enough guessable questions gets up to three of them, spread out', () => {
  const blocks = [quiz('b', ['1', '2', '3', '4', '5', '6'].map((n) => q(n)))];
  const w = autoPretest('l1', blocks)!;
  assert.equal(w.pretest, true);
  assert.equal(w.id, 'pretest-auto-l1');
  assert.deepEqual((w.questions as { id: string }[]).map((x) => x.id), ['1', '3', '5']);
});

test('no warm-up when the lesson has its own, or too few questions, or nothing guessable', () => {
  assert.equal(autoPretest('l', [quiz('w', [q('1')], { pretest: true }), quiz('b', ['2', '3', '4', '5'].map((n) => q(n)))]), null);
  assert.equal(autoPretest('l', [quiz('b', [q('1'), q('2'), q('3')])]), null);
  assert.equal(autoPretest('l', [quiz('b', ['1', '2', '3', '4'].map((n) => q(n, 'short-answer')))]), null);
  assert.equal(autoPretest('l', [{ id: 't', type: 'text' } as Block]), null);
});

test('only guessable kinds are taken and the lesson keeps all its questions', () => {
  const qs = [q('1', 'short-answer'), q('2'), q('3', 'true-false'), q('4', 'numeric'), q('5', 'multi-select')];
  const blocks = [quiz('b', qs)];
  const w = autoPretest('l', blocks)!;
  assert.deepEqual((w.questions as { id: string }[]).map((x) => x.id), ['2', '3', '5']);
  assert.equal((blocks[0].questions as unknown[]).length, 5);
});
