import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { courseSheet, formulasIn, plainFormulasIn } from './sheet.ts';
import type { Course } from './types.ts';

const load = (id: string) => JSON.parse(readFileSync(new URL(`../../courses/${id}.json`, import.meta.url), 'utf8')) as Course;

test('display formulas are kept, inline maths only when it states something', () => {
  assert.deepEqual(formulasIn('Ohm: $U = R \\cdot I$, so $R$ grows. $$P = U \\cdot I$$ and $x$.'), ['P = U \\cdot I', 'U = R \\cdot I']);
  assert.deepEqual(formulasIn('It costs $5 and $10 later.'), []);
  assert.deepEqual(formulasIn('Roughly $f \\approx 50\\,\\text{Hz}$.'), ['f \\approx 50\\,\\text{Hz}']);
});

test('bold plain formulas count, worked results and sentences do not', () => {
  assert.deepEqual(plainFormulasIn('So **U = W / Q** and **G = 1 / R**. Result: **R = 12 Ω**, **Ergebnis: 2,45 · 10⁻⁸ dm = 2,45 µm**.'), ['U = W / Q', 'G = 1 / R']);
  assert.deepEqual(plainFormulasIn('**Strom** fließt, **U_ges = U₁ + U₂** gilt.'), ['U_ges = U₁ + U₂']);
  assert.deepEqual(plainFormulasIn('**U₁ = R₁ · I**'), ['U₁ = R₁ · I']);
  // A worked example is not a formula.
  assert.deepEqual(plainFormulasIn('**R₁ = 470 Ω and R₂ = 1200 Ω in series at 24 V**'), []);
  assert.deepEqual(plainFormulasIn('**I = U / R**, **P = \\sqrt{x}**'), ['I = U / R', 'P = \\sqrt{x}']);
});

const course: Course = {
  schemaVersion: 2,
  id: 'c',
  title: 'C',
  glossary: [
    { term: 'Widerstand', definition: 'hemmt den Strom', i18n: { en: { term: 'Resistance', definition: 'limits current' } } },
    { term: 'Ampere', definition: 'Einheit der Stromstärke', i18n: { en: { term: 'Ampere', definition: 'unit of current' } } }
  ],
  modules: [
    {
      id: 'm1',
      title: 'Ohm',
      lessons: [
        {
          id: 'l1',
          title: 'Ohm\'s law',
          blocks: [
            { id: 'b1', type: 'text', levels: { normal: 'We write $U = R \\cdot I$. Again: $U=R \\cdot I$.' }, i18n: { de: { normal: 'Es gilt $U = R \\cdot I$.' } } },
            { id: 'b2', type: 'callout', style: 'keypoint', markdown: '- Voltage drives current\n- Resistance limits it' },
            { id: 'b3', type: 'callout', style: 'warning', markdown: 'Do not mix up **mA** and **A**.' },
            { id: 'b4', type: 'callout', style: 'tip', markdown: 'A tip, not on the sheet.' }
          ]
        },
        { id: 'l2', title: 'No points', goal: 'Lies eine Schaltung.', blocks: [
          { id: 'b5', type: 'text', levels: { normal: 'Ein Stromkreis ist geschlossen. Strom fließt nur dann. Mehr steht hier.\n\n- a list' }, i18n: { en: { normal: '## Heading\n\nA circuit is closed. Only then current flows. More here.' } } }
        ] },
        { id: 'l2b', title: 'Empty', goal: 'Nothing.', blocks: [] },
        { id: 'l2c', title: 'Lead-in', blocks: [{ id: 'b6', type: 'text', levels: { normal: 'Resistance is measured in ohm. It depends on:\n- the material\n- the length' } }] }
      ]
    },
    { id: 'm2', title: 'Power', lessons: [{ id: 'l3', title: 'P', blocks: [] }], glossary: [{ term: 'Watt', definition: 'unit of power' }] }
  ]
};

test('a lesson brings its key points, its formulas once each, and its warnings but not its tips', () => {
  const sheet = courseSheet(course, 'en');
  const [l1, l2, l3] = sheet.units[0].lessons;
  assert.deepEqual(l1.points, ['Voltage drives current', 'Resistance limits it']);
  assert.deepEqual(l1.formulas, ['$U = R \\cdot I$']);
  assert.deepEqual(l1.warnings, ['Do not mix up **mA** and **A**.']);
  // Without key points the text's first sentences stand in, in the sheet's language; never the goal.
  assert.deepEqual(l2.points, ['A circuit is closed.', 'Only then current flows.']);
  assert.deepEqual(courseSheet(course, 'de').units[0].lessons[1].points, ['Ein Stromkreis ist geschlossen.', 'Strom fließt nur dann.']);
  assert.deepEqual(l3.points, []);
  assert.deepEqual(sheet.units[0].lessons[3].points, ['Resistance is measured in ohm.', 'It depends on: the material; the length']);
});

test('the terms come in the chosen language, sorted', () => {
  // Unit glossaries belong to the whole course too.
  assert.deepEqual(courseSheet(course, 'en').terms.map((t) => t.term), ['Ampere', 'Resistance', 'Watt']);
  assert.deepEqual(courseSheet(course, 'de').terms.map((t) => t.term), ['Ampere', 'Watt', 'Widerstand']);
});

test('one unit alone shows only that unit and its own terms', () => {
  const sheet = courseSheet(course, 'en', 'm2');
  assert.deepEqual(sheet.units.map((u) => u.id), ['m2']);
  assert.deepEqual(sheet.terms, [{ term: 'Watt', definition: 'unit of power' }]);
});

test('a real course: Elektrotechnik gives formulas and warnings in both languages', () => {
  const et = load('elektrotechnik-grundlagen');
  for (const lang of ['de', 'en'] as const) {
    const sheet = courseSheet(et, lang);
    const lessons = sheet.units.flatMap((u) => u.lessons);
    assert.equal(lessons.length, et.modules.reduce((n, m) => n + m.lessons.length, 0));
    assert.ok(lessons.flatMap((l) => l.formulas).length >= 10, lang);
    assert.ok(lessons.flatMap((l) => l.warnings).length >= 5, lang);
    assert.ok(lessons.filter((l) => l.points.length > 0).length >= lessons.length * 0.9, lang);
    assert.ok(lessons.every((l) => l.points.every((p) => !p.endsWith(':'))), lang);
    // No lesson goal ("Du kannst ...") leaks onto the English sheet.
    if (lang === 'en') assert.ok(lessons.every((l) => l.points.every((p) => !p.startsWith('Du kannst'))));
    assert.ok(sheet.terms.length > 10, lang);
  }
});

test('every built-in course makes a sheet without throwing, with a point for every lesson', () => {
  for (const file of ['chess-to-1000', 'datenbanken-erm', 'it-systeme-zahlen-einheiten', 'pflichtenheft', 'sql-detektiv', 'linux-kommandozeile']) {
    const sheet = courseSheet(load(file), 'de');
    assert.ok(sheet.units.flatMap((u) => u.lessons).every((l) => l.points.length > 0), file);
  }
});
