// Study habit: an if-then plan ("After breakfast I open Courseify"), rest days and streak freezes
// that keep a streak alive, and a repeating calendar reminder (.ics) because a web app cannot push.

import type { ActivityDay } from './activity.ts';

/** Active days in a row that earn one streak freeze. */
export const FREEZE_EVERY = 7;
/** Freezes that can be kept at once. */
export const MAX_FREEZES = 2;

export interface StreakInfo {
  /** Active days in the running streak (rest days and frozen days do not count, nor break it). */
  streak: number;
  /** Freezes ready for the next missed day. */
  freezes: number;
  /** Days saved by a freeze, most recent last. */
  frozenDays: string[];
}

const nextDay = (day: string): string => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
};

/** 0 = Sunday ... 6 = Saturday, like Date.getDay(). */
const weekdayOf = (day: string): number => new Date(`${day}T12:00:00`).getDay();

/**
 * The streak with kindness built in: weekdays chosen as rest days never break it, and every
 * {@link FREEZE_EVERY} active days earn a freeze (up to {@link MAX_FREEZES}) that covers one missed day.
 * Today may still be quiet: it only counts once something is done, and never breaks the streak.
 */
export function streakInfo(days: Record<string, ActivityDay> | string[] | Set<string>, today: string, restDays: readonly number[] = []): StreakInfo {
  const set = days instanceof Set ? days : Array.isArray(days) ? new Set(days) : new Set(Object.keys(days));
  const rest = new Set(restDays);
  const sorted = [...set].filter((d) => d <= today).sort();
  if (sorted.length === 0) return { streak: 0, freezes: 0, frozenDays: [] };
  let streak = 0;
  let sinceFreeze = 0;
  let freezes = 0;
  let frozenDays: string[] = [];
  for (let day = sorted[0]; day <= today; day = nextDay(day)) {
    if (set.has(day)) {
      streak += 1;
      sinceFreeze += 1;
      if (sinceFreeze >= FREEZE_EVERY) {
        sinceFreeze = 0;
        freezes = Math.min(MAX_FREEZES, freezes + 1);
      }
    } else if (day === today || rest.has(weekdayOf(day))) {
      // Today is still open; a rest day is free.
      continue;
    } else if (freezes > 0) {
      freezes -= 1;
      frozenDays = [...frozenDays, day];
    } else {
      streak = 0;
      sinceFreeze = 0;
      frozenDays = [];
    }
  }
  return { streak, freezes, frozenDays };
}

// ---------- Calendar reminder ----------

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const escapeText = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** "HH:MM" as 24-hour digits, or null when it is not a time. */
export function parseTime(time: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? { h, m } : null;
}

/** A repeating weekly calendar event at the chosen time on every day that is not a rest day. */
export function buildReminderIcs(options: { cue: string; time: string; restDays: readonly number[]; now?: Date; title: string }): string | null {
  const time = parseTime(options.time);
  if (!time) return null;
  const studyDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !options.restDays.includes(d));
  if (studyDays.length === 0) return null;
  const now = options.now ?? new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const start = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(time.h)}${pad(time.m)}00`;
  const endTotal = time.h * 60 + time.m + 15;
  const end = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(Math.floor(endTotal / 60) % 24)}${pad(endTotal % 60)}00`;
  const description = options.cue.trim() ? escapeText(options.cue.trim()) : escapeText(options.title);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Courseify//Study reminder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:study-reminder-${stamp}@courseify`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${studyDays.map((d) => ICS_DAYS[d]).join(',')}`,
    `SUMMARY:${escapeText(options.title)}`,
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(options.title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\r\n');
}
