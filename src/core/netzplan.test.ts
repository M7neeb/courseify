import test from 'node:test';
import assert from 'node:assert/strict';
import { computePlan, parseAfter } from './netzplan.ts';

// A 3, B 2 (after A), C 4 (after A), D 3 (after B), E 2 (after B, C), F 1 (after D, E).
export const EXAMPLE = [
  { id: 'A', duration: 3, after: [] },
  { id: 'B', duration: 2, after: ['A'] },
  { id: 'C', duration: 4, after: ['A'] },
  { id: 'D', duration: 3, after: ['B'] },
  { id: 'E', duration: 2, after: ['B', 'C'] },
  { id: 'F', duration: 1, after: ['D', 'E'] }
];

test('the example project: times, floats and the critical path', () => {
  const r = computePlan(EXAMPLE);
  assert.ok('plan' in r);
  const { plan } = r;
  assert.equal(plan.duration, 10);
  assert.deepEqual(plan.criticalPath, ['A', 'C', 'E', 'F']);
  const row = (id: string) => plan.rows.find((x) => x.id === id)!;
  assert.deepEqual([row('A').faz, row('A').fez, row('A').saz, row('A').sez, row('A').gp, row('A').fp], [0, 3, 0, 3, 0, 0]);
  assert.deepEqual([row('B').faz, row('B').fez, row('B').saz, row('B').sez, row('B').gp, row('B').fp], [3, 5, 4, 6, 1, 0]);
  assert.deepEqual([row('C').faz, row('C').fez, row('C').saz, row('C').sez, row('C').gp, row('C').fp], [3, 7, 3, 7, 0, 0]);
  assert.deepEqual([row('D').faz, row('D').fez, row('D').saz, row('D').sez, row('D').gp, row('D').fp], [5, 8, 6, 9, 1, 1]);
  assert.deepEqual([row('E').faz, row('E').fez, row('E').saz, row('E').sez, row('E').gp, row('E').fp], [7, 9, 7, 9, 0, 0]);
  assert.deepEqual([row('F').faz, row('F').fez, row('F').saz, row('F').sez, row('F').gp, row('F').fp], [9, 10, 9, 10, 0, 0]);
  assert.deepEqual(plan.rows.filter((x) => x.critical).map((x) => x.id), ['A', 'C', 'E', 'F']);
});

test('the order of the input does not matter', () => {
  const r = computePlan([...EXAMPLE].reverse());
  assert.ok('plan' in r);
  assert.equal(r.plan.duration, 10);
  assert.deepEqual(r.plan.criticalPath, ['A', 'C', 'E', 'F']);
});

test('bad input is named', () => {
  assert.deepEqual(computePlan([]), { error: { kind: 'empty' } });
  assert.deepEqual(computePlan([{ id: 'A', duration: 1, after: [] }, { id: 'A', duration: 2, after: [] }]), { error: { kind: 'duplicate', id: 'A' } });
  assert.deepEqual(computePlan([{ id: 'A', duration: 1, after: ['Z'] }]), { error: { kind: 'unknown', id: 'A', ref: 'Z' } });
  assert.deepEqual(computePlan([{ id: 'A', duration: 1, after: ['A'] }]), { error: { kind: 'self', id: 'A' } });
  assert.deepEqual(computePlan([{ id: 'A', duration: 1, after: ['B'] }, { id: 'B', duration: 1, after: ['A'] }]), { error: { kind: 'cycle' } });
  assert.deepEqual(computePlan([{ id: 'A', duration: -1, after: [] }]), { error: { kind: 'duration', id: 'A' } });
});

test('predecessors are read from free text', () => {
  assert.deepEqual(parseAfter('B, C'), ['B', 'C']);
  assert.deepEqual(parseAfter('B C;D/E'), ['B', 'C', 'D', 'E']);
  assert.deepEqual(parseAfter('-'), []);
  assert.deepEqual(parseAfter(''), []);
});
