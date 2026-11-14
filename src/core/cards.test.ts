import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterAnswer, courseDeck, shuffleDeck } from './cards.ts';
import type { Course } from './types.ts';

const course: Course = {
  schemaVersion: 2,
  id: 'c',
  title: 'C',
  modules: [
    {
      id: 'm1',
      title: 'One',
      lessons: [
        {
          id: 'l1',
          title: 'First',
          blocks: [
            { id: 'b1', type: 'flashcards', cards: [{ front: 'A', back: 'a' }, { front: 'B', back: 'b' }], i18n: { de: { cards: [{ front: 'A-de', back: 'a-de' }, { front: 'B-de', back: 'b-de' }] } } },
            { id: 'b2', type: 'text', markdown: 'no cards here' }
          ]
        }
      ]
    },
    { id: 'm2', title: 'Two', lessons: [{ id: 'l2', title: 'Second', blocks: [{ id: 'b3', type: 'flashcards', cards: [{ front: 'a ', back: 'again' }, { front: 'C', back: 'c' }] }] }] }
  ]
};

test('the deck holds every card once, in course order', () => {
  const deck = courseDeck(course, 'en');
  assert.deepEqual(deck.map((c) => c.front), ['A', 'B', 'C']);
  assert.deepEqual(deck.map((c) => c.id), ['b1:0', 'b1:1', 'b3:1']);
  assert.equal(deck[2]?.lessonTitle, 'Second');
});

test('the deck follows the language and can be cut down to one unit', () => {
  assert.deepEqual(courseDeck(course, 'de', 'm1').map((c) => c.front), ['A-de', 'B-de']);
  assert.deepEqual(courseDeck(course, 'en', 'm2').map((c) => c.front), ['a ', 'C']);
});

test('shuffling keeps every card and is the same for the same seed', () => {
  const cards = Array.from({ length: 20 }, (_, i) => i);
  const once = shuffleDeck(cards, 7);
  assert.deepEqual(once, shuffleDeck(cards, 7));
  assert.notDeepEqual(once, cards);
  assert.deepEqual([...once].sort((a, b) => a - b), cards);
});

test('a known card leaves, a missed card comes back a few cards later', () => {
  assert.deepEqual(afterAnswer([1, 2, 3], true), [2, 3]);
  assert.deepEqual(afterAnswer([1, 2, 3, 4, 5, 6, 7], false), [2, 3, 4, 5, 1, 6, 7]);
  assert.deepEqual(afterAnswer([1, 2], false), [2, 1]);
  assert.deepEqual(afterAnswer([1], false), [1]);
  assert.deepEqual(afterAnswer([], true), []);
});
