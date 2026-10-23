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
    { name: 'exercise', courseId: 'c 1', skillId: 'm1:test' },
    { name: 'exam', courseId: 'c 1' }
  ];
  for (const r of routes) assert.deepEqual(parseHash(formatHash(r)), r);
});

test('chess pages survive a round trip', () => {
  const routes: Route[] = [
    { name: 'play', view: 'games' }, { name: 'play', view: 'endgames' }, { name: 'play', view: 'board' },
    { name: 'drills' }, { name: 'drills', id: 'subnet-network' }, { name: 'drills', id: 'graph' },
    { name: 'play', view: 'game', id: 'g 1' }, { name: 'play', view: 'review', id: 'g1' }, { name: 'play', view: 'endgame', id: 'kq-k' }
  ];
  for (const r of routes) assert.deepEqual(parseHash(formatHash(r)), r);
  assert.equal(formatHash({ name: 'play', view: 'bots' }), '#/play');
  assert.deepEqual(parseHash('#/play/review'), { name: 'play', view: 'games' });
  assert.deepEqual(parseHash('#/play/whatever'), { name: 'play' });
});

test('unknown or empty hashes fall back to Home', () => {
  assert.deepEqual(parseHash(''), { name: 'home' });
  assert.deepEqual(parseHash('#/nope'), { name: 'home' });
});

test('the old dashboard link still opens Home', () => {
  assert.deepEqual(parseHash('#/dashboard'), { name: 'home' });
  assert.equal(formatHash({ name: 'home' }), '#/home');
});
