import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTables } from './sqlCompare.ts';

const t = (columns: string[], ...rows: string[][]) => ({ columns, rows });

test('column names and row order do not matter unless the order is asked for', () => {
  const want = t(['name', 'age'], ['Ada', '36'], ['Bob', '41']);
  assert.deepEqual(compareTables(t(['x', 'y'], ['Bob', '41'], ['Ada', '36']), want), { same: true });
  assert.deepEqual(compareTables(t(['x', 'y'], ['Bob', '41'], ['Ada', '36']), want, true), { same: false, reason: 'order' });
  assert.deepEqual(compareTables(t(['x', 'y'], ['Ada', '36'], ['Bob', '41']), want, true), { same: true });
});

test('numbers and text are compared sensibly', () => {
  assert.deepEqual(compareTables(t(['a'], ['3.0']), t(['a'], ['3'])), { same: true });
  assert.deepEqual(compareTables(t(['a'], [' Ada ']), t(['a'], ['ada'])), { same: true });
  assert.deepEqual(compareTables(t(['a'], ['NULL']), t(['a'], ['0'])), { same: false, reason: 'values' });
});

test('the verdict says what is different', () => {
  const want = t(['a', 'b'], ['1', '2']);
  assert.deepEqual(compareTables(t(['a'], ['1']), want), { same: false, reason: 'columns', got: 1, want: 2 });
  assert.deepEqual(compareTables(t(['a', 'b']), want), { same: false, reason: 'rows', got: 0, want: 1 });
  assert.deepEqual(compareTables(t(['a', 'b'], ['1', '3']), want), { same: false, reason: 'values' });
});
