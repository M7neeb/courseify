import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockLanguages, rationaleFor, resolveCalloutMarkdown, resolveFlashcards, resolveImageAlt, resolveImageCaption, resolveQuestion, resolveQuestions, resolveTextLevels } from './localize.ts';
import type { Block, Question } from './types.ts';

const textBlock: Block = {
  id: 't1',
  type: 'text',
  levels: { normal: 'Hello', simple: 'Hi' },
  i18n: { de: { normal: 'Hallo', simple: 'Hallo kurz' }, en: { detailed: 'English detail' } }
};

test('text levels prefer i18n and fall back to the legacy levels', () => {
  const de = resolveTextLevels(textBlock, 'de');
  assert.equal(de.normal, 'Hallo');
  assert.equal(de.simple, 'Hallo kurz');
  assert.equal(de.detailed, undefined);

  const en = resolveTextLevels(textBlock, 'en');
  assert.equal(en.normal, 'Hello'); // i18n.en has no "normal", the legacy field wins
  assert.equal(en.simple, 'Hi');
  assert.equal(en.detailed, 'English detail'); // only in i18n.en
});

test('a text block with neither levels nor i18n falls back to markdown', () => {
  const b: Block = { id: 't2', type: 'text', markdown: 'plain' };
  assert.equal(resolveTextLevels(b, 'de').normal, 'plain');
});

test('callout markdown resolution prefers i18n, then the top-level field', () => {
  const b: Block = { id: 'c1', type: 'callout', markdown: 'Note', i18n: { de: { normal: 'Hinweis' } } };
  assert.equal(resolveCalloutMarkdown(b, 'de'), 'Hinweis');
  assert.equal(resolveCalloutMarkdown(b, 'en'), 'Note');
});

test('question resolution swaps prompt/options/answer/explanation/hint per language', () => {
  const q: Question = {
    id: 'q1',
    kind: 'multiple-choice',
    prompt: 'Which one?',
    options: ['A', 'B'],
    answer: 0,
    explanation: 'Because A',
    hint: 'Look closely',
    i18n: { de: { prompt: 'Welche?', options: ['A', 'B'], answer: 1, explanation: 'Weil B', hint: 'Schau genau' } }
  };
  const de = resolveQuestion(q, 'de');
  assert.equal(de.prompt, 'Welche?');
  assert.equal(de.answer, 1);
  assert.equal(de.explanation, 'Weil B');
  assert.equal(de.hint, 'Schau genau');

  const en = resolveQuestion(q, 'en');
  assert.equal(en.prompt, 'Which one?');
  assert.equal(en.answer, 0);
  assert.equal(en.hint, 'Look closely');
});

test('a question without i18n for the language is returned untouched', () => {
  const q: Question = { id: 'q2', kind: 'true-false', prompt: 'True?', answer: true };
  assert.equal(resolveQuestion(q, 'de'), q);
});

test('rationales resolve for the chosen language and fall back', () => {
  const q: Question = {
    id: 'r1',
    kind: 'multiple-choice',
    prompt: '?',
    options: ['a', 'b'],
    answer: 0,
    rationales: ['top-0', 'top-1'],
    i18n: { de: { rationales: ['de-0', 'de-1'] } }
  };
  assert.equal(rationaleFor(resolveQuestion(q, 'de'), 1), 'de-1');
  assert.equal(rationaleFor(resolveQuestion(q, 'en'), 1), 'top-1');
  assert.equal(rationaleFor(q, 0), 'top-0');
  assert.equal(rationaleFor(q, 5), undefined);
});

test('an empty or missing rationale entry has no text', () => {
  const q: Question = {
    id: 'r2',
    kind: 'multiple-choice',
    prompt: '?',
    options: ['a', 'b'],
    answer: 0,
    rationales: ['', 'why']
  };
  assert.equal(rationaleFor(q, 0), undefined);
  assert.equal(rationaleFor(q, 1), 'why');
  assert.equal(rationaleFor(q, 9), undefined);
  const none: Question = { id: 'r3', kind: 'true-false', prompt: '?', answer: true };
  assert.equal(rationaleFor(none, 0), undefined);
});

test('matching pairs and ordering items localize per language', () => {
  const q: Question = {
    id: 'm1',
    kind: 'matching',
    prompt: '?',
    pairs: [
      { left: 'A', right: '1' },
      { left: 'B', right: '2' }
    ],
    items: ['one', 'two'],
    i18n: {
      de: {
        pairs: [
          { left: 'Ä', right: '1' },
          { left: 'B', right: '2' }
        ],
        items: ['eins', 'zwei']
      }
    }
  };
  const de = resolveQuestion(q, 'de');
  assert.equal(de.pairs?.[0]?.left, 'Ä');
  assert.deepEqual(de.items, ['eins', 'zwei']);
  assert.equal(resolveQuestion(q, 'en').pairs?.[0]?.left, 'A');
});

test('image alt and caption localize and fall back to the top-level fields', () => {
  const b: Block = {
    id: 'i1',
    type: 'image',
    searchTerm: 'x',
    alt: 'top alt',
    caption: 'top cap',
    i18n: { de: { alt: 'de alt' }, en: { caption: 'en cap' } }
  };
  assert.equal(resolveImageAlt(b, 'de'), 'de alt');
  assert.equal(resolveImageAlt(b, 'en'), 'top alt');
  assert.equal(resolveImageCaption(b, 'de'), 'top cap');
  assert.equal(resolveImageCaption(b, 'en'), 'en cap');
});

test('resolveQuestions maps every question in a quiz block', () => {
  const block: Block = {
    id: 'z',
    type: 'quiz',
    questions: [
      { id: 'a', kind: 'true-false', prompt: 'A', answer: true, i18n: { de: { prompt: 'A de' } } },
      { id: 'b', kind: 'true-false', prompt: 'B', answer: false }
    ]
  };
  const out = resolveQuestions(block, 'de');
  assert.equal(out[0]?.prompt, 'A de');
  assert.equal(out[1]?.prompt, 'B');
});

test('block languages come from block and question i18n entries', () => {
  assert.deepEqual(blockLanguages([textBlock]), ['en', 'de']);
  assert.deepEqual(blockLanguages([{ id: 'p', type: 'text', levels: { normal: 'Plain' } }]), []);
  const quiz: Block = {
    id: 'q',
    type: 'quiz',
    questions: [{ id: 'q1', kind: 'true-false', prompt: '?', answer: true, i18n: { de: { prompt: 'Wahr?' } } }]
  };
  assert.deepEqual(blockLanguages([quiz]), ['de']);
});

test('flashcards prefer the cards of the chosen language, then the top-level cards', () => {
  const block: Block = {
    id: 'f',
    type: 'flashcards',
    cards: [{ front: 'Kupfer', back: 'Cu' }],
    i18n: { en: { cards: [{ front: 'Copper', back: 'Cu' }] } }
  };
  assert.deepEqual(resolveFlashcards(block, 'en'), [{ front: 'Copper', back: 'Cu' }]);
  assert.deepEqual(resolveFlashcards(block, 'de'), [{ front: 'Kupfer', back: 'Cu' }]);
  assert.deepEqual(resolveFlashcards({ id: 'g', type: 'flashcards', cards: 'x' }, 'de'), []);
});
