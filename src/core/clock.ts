// Chess clocks and the rating against the bots. Pure functions; the game screen ticks the clock.

import { Chess } from 'chess.js';

/** Minutes and increment, both in seconds. */
export interface TimeControl {
  base: number;
  inc: number;
}

/** The choices in the bot picker; null plays without a clock. */
export const TIME_CONTROLS: (TimeControl | null)[] = [
  null,
  { base: 60, inc: 0 },
  { base: 120, inc: 1 },
  { base: 180, inc: 0 },
  { base: 180, inc: 2 },
  { base: 300, inc: 0 },
  { base: 600, inc: 0 },
  { base: 900, inc: 10 },
  { base: 1800, inc: 0 }
];

export type TimeCategory = 'bullet' | 'blitz' | 'rapid' | 'classical';

/** chess.com's grouping by the expected length of a game (base + 40 increments). */
export function timeCategory(tc: TimeControl): TimeCategory {
  const total = tc.base + 40 * tc.inc;
  if (total < 180) return 'bullet';
  if (total < 600) return 'blitz';
  if (total < 3600) return 'rapid';
  return 'classical';
}

/** "3 | 2", "10 min", "1 min". */
export function timeLabel(tc: TimeControl): string {
  const min = tc.base / 60;
  const m = Number.isInteger(min) ? String(min) : min.toFixed(1);
  return tc.inc > 0 ? `${m} | ${tc.inc}` : `${m} min`;
}

export function sameTime(a: TimeControl | null | undefined, b: TimeControl | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.base === b.base && a.inc === b.inc;
}

/** A clock face: "10:00", "1:05:00", and tenths in the last 20 seconds ("0:09.4"). */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 20_000) {
    const tenths = Math.floor(clamped / 100);
    return `0:${String(Math.floor(tenths / 10)).padStart(2, '0')}.${tenths % 10}`;
  }
  const total = Math.ceil(clamped / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Whether a side could still mate at all. When the other side runs out of time and this side has
 * only a king, or a king and one bishop or knight, the game is a draw instead of a win.
 */
export function canMate(fen: string, color: 'w' | 'b'): boolean {
  let minors = 0;
  for (const row of new Chess(fen).board()) {
    for (const sq of row) {
      if (!sq || sq.color !== color || sq.type === 'k') continue;
      if (sq.type === 'n' || sq.type === 'b') minors += 1;
      else return true;
    }
  }
  return minors >= 2;
}

/** How long the bot may think, given its clock: a share of what is left plus the increment. */
export function botThinkTime(remainingMs: number, incSeconds: number, normalMs: number): number {
  const budget = remainingMs / 35 + incSeconds * 800;
  return Math.round(Math.max(80, Math.min(normalMs, budget)));
}

// ---------- rating against the bots ----------

export const START_RATING = 800;

/** Elo change for a game: score 1 win, 0.5 draw, 0 loss. Moves faster for the first 10 games. */
export function ratingChange(rating: number, opponent: number, score: number, games: number): number {
  const k = games < 10 ? 40 : 20;
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400));
  return Math.round(k * (score - expected));
}

// ---------- captured pieces ----------

const START_COUNT: Record<string, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 };
const PIECE_VALUE: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };

/**
 * Pieces each side has lost, most valuable first, and the material balance (+ means White is
 * ahead). Promoted pieces count against the pawns they came from.
 */
export function capturedPieces(fen: string): { w: string[]; b: string[]; diff: number } {
  const count = { w: { q: 0, r: 0, b: 0, n: 0, p: 0 } as Record<string, number>, b: { q: 0, r: 0, b: 0, n: 0, p: 0 } as Record<string, number> };
  let diff = 0;
  for (const row of new Chess(fen).board()) {
    for (const sq of row) {
      if (!sq || sq.type === 'k') continue;
      count[sq.color][sq.type] = (count[sq.color][sq.type] ?? 0) + 1;
      diff += (sq.color === 'w' ? 1 : -1) * (PIECE_VALUE[sq.type] ?? 0);
    }
  }
  const lost = (c: 'w' | 'b'): string[] => {
    const out: string[] = [];
    // Extra queens and the like come from pawns.
    let promoted = 0;
    for (const t of ['q', 'r', 'b', 'n']) promoted += Math.max(0, (count[c][t] ?? 0) - START_COUNT[t]!);
    for (const t of ['q', 'r', 'b', 'n', 'p']) {
      const missing = t === 'p' ? START_COUNT.p! - (count[c].p ?? 0) - promoted : START_COUNT[t]! - (count[c][t] ?? 0);
      for (let i = 0; i < missing; i += 1) out.push(t);
    }
    return out;
  };
  return { w: lost('w'), b: lost('b'), diff };
}
