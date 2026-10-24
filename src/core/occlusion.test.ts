import test from 'node:test';
import assert from 'node:assert/strict';
import { occlusionMasks, occlusionPicture, testOrder } from './occlusion.ts';
import { seededRng } from './drills.ts';
import { validateCourse } from './validate.ts';
import type { Block } from './types.ts';

const block: Block = {
  id: 'o',
  type: 'occlusion',
  svg: '<svg viewBox="0 0 10 10"></svg>',
  alt: 'A circuit',
  areas: [
    { x: 10, y: 10, w: 20, h: 20, label: 'Resistor' },
    { x: 50, y: 50, w: 60, h: 20, label: 'off the picture' },
    { x: 0, y: 0, w: 0, h: 5, label: 'empty' },
    { x: 60, y: 60, w: 30, h: 30, label: 'Battery' }
  ],
  i18n: { de: { alt: 'Eine Schaltung', areaLabels: ['Widerstand', '', '', 'Batterie'] } } as unknown as Block['i18n']
};

test('masks outside the picture or without size are dropped, labels follow the language', () => {
  assert.deepEqual(occlusionMasks(block, 'en').map((m) => m.label), ['Resistor', 'Battery']);
  assert.deepEqual(occlusionMasks(block, 'de').map((m) => m.label), ['Widerstand', 'Batterie']);
  assert.equal(occlusionPicture(block, 'de').alt, 'Eine Schaltung');
  assert.equal(occlusionPicture(block, 'en').alt, 'A circuit');
  assert.equal(occlusionPicture({ id: 'x', type: 'occlusion', url: 'javascript:alert(1)' }, 'en').url, '');
});

test('the test order holds every mask once', () => {
  const order = testOrder(7, seededRng(4));
  assert.deepEqual([...order].sort(), [0, 1, 2, 3, 4, 5, 6]);
});

test('the validator accepts good occlusion blocks and names the problem in bad ones', () => {
  const course = (b: unknown) => ({ schemaVersion: 2, id: 'c', title: 'C', modules: [{ id: 'm', title: 'M', lessons: [{ id: 'l', title: 'L', blocks: [b] }] }] });
  const good = { id: 'o', type: 'occlusion', svg: '<svg></svg>', areas: [{ x: 1, y: 1, w: 10, h: 10, label: 'a' }] };
  assert.equal(validateCourse(course(good)).ok, true);
  const noPic = validateCourse(course({ ...good, svg: undefined }));
  assert.equal(noPic.ok, false);
  const bad = validateCourse(course({ ...good, areas: [{ x: 95, y: 1, w: 10, h: 10 }] }));
  assert.equal(bad.ok, false);
});
