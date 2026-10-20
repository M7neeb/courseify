import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatHash, parseHash } from './router.ts';
import type { Route } from './types.ts';

test('routes survive a format/parse round trip', () => {
  const routes: Route[] = [
    { name: 'home' }, { name: 'library' }, { name: 'import' }, { name: 'prompt' }, { name: 'settings' }, { name: 'profile' },
    { name: 'review' }, { name: 'trash' }, { name: 'play' }, { name: 'settings', courseId: 'c 1' },
    { name: 'player', courseId: 'c1' },
    { name: 'player', courseId: 'c 1', lessonId: 'm1:test' },
    { name: 'exercise', courseId: 'c1', skillId: 'l1' },
    { name: 'exercise', courseId: 'c 1', skillId: 'm1:test' }
  ];
  for (const r of routes) assert.deepEqual(parseHash(formatHash(r)), r);
});

test('unknown or empty hashes fall back to Home', () => {
  assert.deepEqual(parseHash(''), { name: 'home' });
  assert.deepEqual(parseHash('#/nope'), { name: 'home' });
});

test('the old dashboard link still opens Home', () => {
  assert.deepEqual(parseHash('#/dashboard'), { name: 'home' });
  assert.equal(formatHash({ name: 'home' }), '#/home');
});
