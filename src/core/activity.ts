// Per-day activity and the derived streak / XP / level numbers. Pure logic, no storage.

import { streakInfo } from './habit.ts';

export interface ActivityDay {
  day: string; // local calendar day, YYYY-MM-DD
  correct: number;
  lessons: number;
  xp: number;
}

export const XP_PER_CORRECT = 10;
export const XP_PER_LESSON = 5;

/** Cumulative XP that unlocks each level; index 0 is level 1. */
export const LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function emptyDay(day: string): ActivityDay {
  return { day, correct: 0, lessons: 0, xp: 0 };
}

/** Adds one correct answer (+10 XP) or one completed lesson (+5 XP) to a day. */
export function withActivity(day: ActivityDay, kind: 'correct' | 'lesson'): ActivityDay {
  if (kind === 'correct') return { ...day, correct: day.correct + 1, xp: day.xp + XP_PER_CORRECT };
  return { ...day, lessons: day.lessons + 1, xp: day.xp + XP_PER_LESSON };
}

export function normalizeActivity(raw: unknown): ActivityDay | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) return null;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { day: r.day, correct: num(r.correct), lessons: num(r.lessons), xp: num(r.xp) };
}

/** The calendar day before the given one, using local date arithmetic. */
export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() - 1);
  return dayKey(date);
}

/** The last `count` day keys ending today, oldest first. */
export function lastDays(today: string, count: number): string[] {
  const out: string[] = [];
  let cursor = today;
  for (let i = 0; i < count; i += 1) {
    out.unshift(cursor);
    cursor = previousDay(cursor);
  }
  return out;
}

/** A Monday-first, 53-week activity calendar ending in the current week. */
export function activityWeeks(today: string, count = 53): string[][] {
  const [year, month, day] = today.split('-').map(Number);
  const end = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12);
  const offset = (end.getDay() + 6) % 7;
  end.setDate(end.getDate() - offset - (count - 1) * 7);
  return Array.from({ length: count }, () => {
    const week = Array.from({ length: 7 }, () => {
      const key = dayKey(end);
      end.setDate(end.getDate() + 1);
      return key;
    });
    return week;
  });
}

export function totalXp(days: Record<string, ActivityDay>): number {
  return Object.values(days).reduce((sum, d) => sum + d.xp, 0);
}

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (xp >= (LEVEL_THRESHOLDS[i] ?? Infinity)) level = i + 1;
  }
  return level;
}

export function xpForLevel(level: number): number {
  const clamped = Math.min(Math.max(Math.floor(level), 1), LEVEL_THRESHOLDS.length);
  return LEVEL_THRESHOLDS[clamped - 1] ?? 0;
}

/** XP still needed for the next level, or null at the top level. */
export function xpToNextLevel(xp: number): number | null {
  const level = levelForXp(xp);
  if (level >= LEVEL_THRESHOLDS.length) return null;
  return (LEVEL_THRESHOLDS[level] ?? 0) - xp;
}

/** Consecutive active days ending today, or yesterday when today is still quiet. */
export function currentStreak(days: Record<string, ActivityDay> | string[] | Set<string>, today: string): number {
  const set = days instanceof Set ? days : Array.isArray(days) ? new Set(days) : new Set(Object.keys(days));
  let cursor = today;
  if (!set.has(cursor)) {
    cursor = previousDay(today);
    if (!set.has(cursor)) return 0;
  }
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

export interface Stats {
  totalXp: number;
  level: number;
  xpToNext: number | null;
  streak: number;
  /** Streak freezes ready (see habit.ts). */
  freezes: number;
  activeDays: number;
  days: ActivityDay[];
}

export function computeStats(days: Record<string, ActivityDay>, today: string, restDays: readonly number[] = []): Stats {
  const list = Object.values(days).sort((a, b) => a.day.localeCompare(b.day));
  const xp = totalXp(days);
  const info = streakInfo(days, today, restDays);
  return {
    totalXp: xp,
    level: levelForXp(xp),
    xpToNext: xpToNextLevel(xp),
    streak: info.streak,
    freezes: info.freezes,
    activeDays: list.length,
    days: list
  };
}
