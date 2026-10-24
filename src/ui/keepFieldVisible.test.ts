import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollNeeded } from './keepFieldVisible.ts';

test('a field behind the bottom bar is scrolled clear of it, one above it stays put', () => {
  assert.equal(scrollNeeded(720, 800, 80), 12);
  assert.equal(scrollNeeded(500, 800, 80), 0);
  assert.equal(scrollNeeded(790, 400, 0), 402);
  assert.equal(scrollNeeded(708, 800, 80), 0);
});
