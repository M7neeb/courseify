import test from 'node:test';
import assert from 'node:assert/strict';
import { nextFocusIndex } from './focusTrap.ts';

test('Tab wraps from the last control to the first and Shift+Tab the other way round', () => {
  assert.equal(nextFocusIndex(4, 3, false), 0);
  assert.equal(nextFocusIndex(4, 0, true), 3);
  assert.equal(nextFocusIndex(4, 1, false), 2);
  assert.equal(nextFocusIndex(4, 2, true), 1);
});

test('focus outside the menu comes in at the matching end', () => {
  assert.equal(nextFocusIndex(4, -1, false), 0);
  assert.equal(nextFocusIndex(4, -1, true), 3);
  assert.equal(nextFocusIndex(0, -1, false), -1);
});
