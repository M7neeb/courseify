import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonSpeech, speechChunks, speechLang, speechText } from './speech.ts';

test('Markdown becomes plain sentences: no marks, no links, no code', () => {
  const md = '## Ohm\n\nA **resistor** limits the [current](https://x.y).\n\n- first point\n- second point\n\n```python\nprint(1)\n```\n\n> Note this.';
  assert.equal(speechText(md), 'Ohm. A resistor limits the current. first point second point Note this.');
});

test('formulas are read as their symbols, tables row by row', () => {
  assert.equal(speechText('So $U = R \\cdot I$ holds.'), 'So U = R · I holds.');
  assert.equal(speechText('$$G = \\frac{1}{R}$$'), 'G = 1 / R.');
  assert.equal(speechText('| Prefix | Factor |\n|---|---|\n| kilo | 1000 |'), 'Prefix, Factor. kilo, 1000.');
  assert.equal(speechText('$f \\approx 50\\,\\text{Hz}$'), 'f approx 50 Hz');
});

test('a mermaid diagram and HTML are left out', () => {
  assert.equal(speechText('Look:\n\n```mermaid\ngraph LR; A-->B\n```\n\nDone <br> now.'), 'Look: Done now.');
});

test('pieces keep whole sentences and stay short', () => {
  const text = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} is here.`).join(' ');
  const chunks = speechChunks(text, 80);
  assert.ok(chunks.length > 3);
  assert.ok(chunks.every((c) => c.length <= 80 && c.endsWith('.')));
  assert.equal(chunks.join(' '), text);
  // One sentence longer than the limit is not cut in the middle.
  assert.deepEqual(speechChunks('x'.repeat(300) + '.', 80), ['x'.repeat(300) + '.']);
  assert.deepEqual(speechChunks(''), []);
});

test('voices are picked by region for the two course languages', () => {
  assert.equal(speechLang('de'), 'de-DE');
  assert.equal(speechLang('en'), 'en-US');
});

test('a lesson is read in the chosen language and depth, title first, quizzes and videos left out', () => {
  const lesson = {
    id: 'l1',
    title: 'Ohm',
    blocks: [
      { id: 'a', type: 'text', levels: { normal: 'Normal text.', simple: 'Simple text.' }, i18n: { de: { normal: 'Normaler Text.' } } },
      { id: 'b', type: 'quiz', questions: [{ id: 'q', kind: 'true-false', prompt: 'Not read', answer: true }] },
      { id: 'c', type: 'callout', style: 'keypoint', markdown: 'Key point.' },
      { id: 'd', type: 'video', url: 'x' }
    ]
  };
  assert.equal(speechText(lessonSpeech(lesson, 'en')), 'Ohm. Normal text. Key point.');
  assert.equal(speechText(lessonSpeech(lesson, 'en', 'simple')), 'Ohm. Simple text. Key point.');
  assert.equal(speechText(lessonSpeech(lesson, 'de')), 'Ohm. Normaler Text. Key point.');
});
