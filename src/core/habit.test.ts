import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReminderIcs, parseTime, streakInfo } from './habit.ts';

// 2026-10-05 is a Monday.
const days = (...d: string[]) => new Set(d.map((x) => `2026-10-${x}`));
const run = (from: number, to: number) => days(...Array.from({ length: to - from + 1 }, (_, i) => String(from + i).padStart(2, '0')));

test('a plain streak counts consecutive days, and a quiet today does not break it', () => {
  assert.equal(streakInfo(run(1, 3), '2026-10-03').streak, 3);
  assert.equal(streakInfo(run(1, 3), '2026-10-04').streak, 3);
  assert.equal(streakInfo(run(1, 3), '2026-10-05').streak, 0);
  assert.equal(streakInfo(new Set<string>(), '2026-10-05').streak, 0);
});

test('rest days never break the streak or add to it', () => {
  // Sat 3 and Sun 4 are off; Fri 2 and Mon 5 are active.
  assert.equal(streakInfo(days('01', '02', '05'), '2026-10-05', []).streak, 1);
  assert.equal(streakInfo(days('01', '02', '05'), '2026-10-05', [6, 0]).streak, 3);
});

test('seven active days earn a freeze that covers one missed day, once', () => {
  const week = run(1, 7);
  const info = streakInfo(week, '2026-10-07');
  assert.equal(info.streak, 7);
  assert.equal(info.freezes, 1);
  const missed = new Set([...week, '2026-10-09']);
  const after = streakInfo(missed, '2026-10-09');
  assert.equal(after.streak, 8);
  assert.equal(after.freezes, 0);
  assert.deepEqual(after.frozenDays, ['2026-10-08']);
  const twice = new Set([...week, '2026-10-10']);
  // Two missed days (8 and 9) with one freeze: the streak starts again on day 10.
  assert.equal(streakInfo(twice, '2026-10-10').streak, 1);
});

test('freezes are capped at two', () => {
  const info = streakInfo(run(1, 24), '2026-10-24');
  assert.equal(info.streak, 24);
  assert.equal(info.freezes, 2);
});

test('the reminder file repeats on study days only', () => {
  const now = new Date(2026, 9, 24, 8, 0, 0);
  const ics = buildReminderIcs({ cue: 'After breakfast, on the bus', time: '18:30', restDays: [0, 6], now, title: 'Study; with Courseify' })!;
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART:20261024T183000'));
  assert.ok(ics.includes('DTEND:20261024T184500'));
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'));
  assert.ok(ics.includes('SUMMARY:Study\\; with Courseify'));
  assert.ok(ics.includes('DESCRIPTION:After breakfast\\, on the bus'));
  assert.equal(buildReminderIcs({ cue: '', time: '', restDays: [], title: 'x' }), null);
  assert.equal(buildReminderIcs({ cue: '', time: '08:00', restDays: [0, 1, 2, 3, 4, 5, 6], title: 'x' }), null);
});

test('times are read as 24-hour HH:MM', () => {
  assert.deepEqual(parseTime('7:05'), { h: 7, m: 5 });
  assert.equal(parseTime('24:00'), null);
  assert.equal(parseTime('abc'), null);
});
