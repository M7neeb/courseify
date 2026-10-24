// The chess bots: a ladder of opponents from someone who just learnt the moves to the engine at
// full strength. Ratings are approximate. From 1320 up Stockfish's own strength limit is used;
// below that the bot takes the engine's top moves and picks among them with deliberate,
// human-looking mistakes. Each bot also has a style (it prefers certain moves when they are about
// as good as the best one) and favourite openings it plays from memory.

import { Chess, type Square } from 'chess.js';

export type BotStyle = 'balanced' | 'aggressive' | 'defensive' | 'queen' | 'pawns' | 'trader' | 'positional' | 'chaos';
export const BOT_STYLES: BotStyle[] = ['balanced', 'aggressive', 'defensive', 'queen', 'pawns', 'trader', 'positional', 'chaos'];

export interface Bot {
  id: string;
  name: string;
  elo: number;
  /** Avatar colour. */
  color: string;
  /** A chess piece shown in the avatar. */
  piece: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  style: BotStyle;
  /** Opening lines it knows by heart, as UCI moves from the start ("e2e4 e7e5 f2f4"). */
  book?: string[];
  /** A bot made on the spot with "Custom": any strength, no personality. */
  custom?: boolean;
}

export type BotGroup = 'beginner' | 'intermediate' | 'advanced' | 'master';

export const BOTS: readonly Bot[] = [
  { id: 'nova', name: 'Nova', elo: 100, color: '#b9c9d8', piece: 'p', style: 'chaos' },
  { id: 'pip', name: 'Pip', elo: 250, color: '#8fb8de', piece: 'p', style: 'chaos' },
  { id: 'bo', name: 'Bo', elo: 300, color: '#d8b48a', piece: 'p', style: 'pawns', book: ['a2a4', 'h2h4', 'e2e4 a7a5', 'd2d4 h7h5'] },
  { id: 'juna', name: 'Juna', elo: 400, color: '#f2a65a', piece: 'p', style: 'queen', book: ['e2e4 e7e5 d1h5', 'e2e4 e7e5 g1f3 d8f6', 'd2d4 d7d5 d1d3'] },
  { id: 'emil', name: 'Emil', elo: 500, color: '#a3c4a8', piece: 'n', style: 'trader', book: ['e2e4 e7e5 d2d4 e5d4 d1d4', 'd2d4 e7e5 d4e5'] },
  { id: 'theo', name: 'Theo', elo: 600, color: '#9bc77a', piece: 'n', style: 'balanced', book: ['e2e4 e7e5 g1f3 b8c6 f1c4', 'e2e4 e7e5 g1f3 b8c6'] },
  { id: 'zara', name: 'Zara', elo: 700, color: '#ef8f6b', piece: 'n', style: 'aggressive', book: ['e2e4 e7e5 f2f4', 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6', 'd2d4 d7d5 c2c4 e7e5'] },
  { id: 'mara', name: 'Mara', elo: 800, color: '#e88aa8', piece: 'n', style: 'balanced', book: ['e2e4 e7e5 g1f3 b8c6 f1b5', 'e2e4 e7e5'] },
  { id: 'felix', name: 'Felix', elo: 900, color: '#89a7c9', piece: 'b', style: 'defensive', book: ['d2d4 d7d5 c1f4', 'e2e4 e7e6 d2d4 d7d5', 'd2d4 d7d5'] },
  { id: 'ravi', name: 'Ravi', elo: 1000, color: '#7fc8b8', piece: 'b', style: 'aggressive', book: ['e2e4 e7e5 g1f3 b8c6 f1c4 f8c5', 'e2e4 c7c5'] },
  { id: 'aiko', name: 'Aiko', elo: 1100, color: '#f0b7c8', piece: 'b', style: 'positional', book: ['d2d4 d7d5 c2c4', 'e2e4 c7c6 d2d4 d7d5', 'd2d4 g8f6 c2c4 e7e6'] },
  { id: 'lena', name: 'Lena', elo: 1200, color: '#c39be0', piece: 'b', style: 'defensive', book: ['d2d4 d7d5 g1f3 g8f6 c1f4', 'e2e4 e7e6', 'd2d4 g8f6'] },
  { id: 'mateo', name: 'Mateo', elo: 1300, color: '#e3965f', piece: 'r', style: 'aggressive', book: ['e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4', 'e2e4 c7c5 g1f3 d7d6', 'd2d4 d7d5 c2c4 e7e5'] },
  { id: 'oskar', name: 'Oskar', elo: 1400, color: '#e0b84a', piece: 'r', style: 'aggressive', book: ['e2e4 e7e5 g1f3 b8c6 d2d4', 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6'] },
  { id: 'nadia', name: 'Nadia', elo: 1500, color: '#79b0a0', piece: 'r', style: 'positional', book: ['c2c4', 'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4', 'e2e4 c7c6 d2d4 d7d5'] },
  { id: 'sofia', name: 'Sofia', elo: 1600, color: '#6aa6e8', piece: 'r', style: 'balanced', book: ['e2e4 e7e5 g1f3 b8c6 f1b5 a7a6', 'd2d4 d7d5 c2c4 c7c6'] },
  { id: 'lukas', name: 'Lukas', elo: 1700, color: '#b49a6c', piece: 'q', style: 'trader', book: ['e2e4 e7e5 g1f3 g8f6', 'd2d4 d7d5 c2c4 d5c4'] },
  { id: 'kenji', name: 'Kenji', elo: 1800, color: '#e07a5f', piece: 'q', style: 'positional', book: ['d2d4 g8f6 c2c4 e7e6 g1f3 b7b6', 'e2e4 c7c5'] },
  { id: 'priya', name: 'Priya', elo: 1900, color: '#d16ba5', piece: 'q', style: 'aggressive', book: ['e2e4 e7e5 f2f4 e5f4', 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6'] },
  { id: 'amara', name: 'Amara', elo: 2000, color: '#5fb37a', piece: 'q', style: 'balanced', book: ['e2e4 e7e5 g1f3 b8c6 f1b5', 'd2d4 g8f6 c2c4 g7g6'] },
  { id: 'jonas', name: 'Jonas', elo: 2100, color: '#7d8fa8', piece: 'q', style: 'defensive', book: ['e2e4 c7c6', 'd2d4 d7d5 c2c4 e7e6', 'g1f3'] },
  { id: 'viktor', name: 'Viktor', elo: 2200, color: '#8a8fd6', piece: 'k', style: 'balanced', book: ['d2d4 d7d5 c2c4', 'e2e4 e7e5'] },
  { id: 'chen', name: 'Chen', elo: 2300, color: '#5aa0a8', piece: 'k', style: 'positional', book: ['c2c4 e7e5 b1c3', 'd2d4 g8f6 c2c4 e7e6 g1f3 d7d5'] },
  { id: 'elif', name: 'Elif', elo: 2400, color: '#c96b6b', piece: 'k', style: 'aggressive', book: ['e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6', 'e2e4 e7e5 g1f3 b8c6 f1c4'] },
  { id: 'ingrid', name: 'Ingrid', elo: 2500, color: '#d6697a', piece: 'k', style: 'balanced' },
  { id: 'rafael', name: 'Rafael', elo: 2650, color: '#6f9f5f', piece: 'k', style: 'positional', book: ['d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6'] },
  { id: 'yuki', name: 'Yuki', elo: 2800, color: '#5f7fbf', piece: 'k', style: 'aggressive', book: ['e2e4 e7e5 g1f3 b8c6 f1b5 g8f6'] },
  { id: 'max', name: 'Max', elo: 3000, color: '#4a5568', piece: 'k', style: 'balanced' },
  { id: 'atlas', name: 'Atlas', elo: 3200, color: '#1f2937', piece: 'k', style: 'balanced' }
];

export const CUSTOM_MIN = 100;
export const CUSTOM_MAX = 3200;

/** A custom bot at any strength: "custom-1450". */
export function customBot(elo: number): Bot {
  const e = Math.round(Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, elo)) / 50) * 50;
  const piece: Bot['piece'] = e < 600 ? 'p' : e < 900 ? 'n' : e < 1300 ? 'b' : e < 1700 ? 'r' : e < 2300 ? 'q' : 'k';
  return { id: `custom-${e}`, name: `Bot ${e}`, elo: e, color: '#6b7280', piece, style: 'balanced', custom: true };
}

export function botById(id: string): Bot | undefined {
  const custom = /^custom-(\d+)$/.exec(id);
  if (custom) return customBot(Number(custom[1]));
  return BOTS.find((b) => b.id === id);
}

export function botGroup(bot: Bot): BotGroup {
  if (bot.elo < 900) return 'beginner';
  if (bot.elo < 1700) return 'intermediate';
  if (bot.elo < 2400) return 'advanced';
  return 'master';
}

/**
 * How the engine plays for a bot.
 * - weak: search to `depth` with `multipv` lines, then pick one with a random spread of
 *   `spread` centipawns; with chance `blunder` play any legal move.
 * - elo: Stockfish's own strength limit.
 * - full: no limit.
 */
export type BotSearch =
  | { kind: 'weak'; depth: number; multipv: number; spread: number; blunder: number }
  | { kind: 'elo'; elo: number; movetime: number }
  | { kind: 'full'; movetime: number };

type Weak = Extract<BotSearch, { kind: 'weak' }>;

/** Fixed points of the weak ladder; strengths in between are interpolated. */
const WEAK_ANCHORS: [number, Omit<Weak, 'kind'>][] = [
  [100, { depth: 1, multipv: 14, spread: 700, blunder: 0.42 }],
  [250, { depth: 1, multipv: 12, spread: 500, blunder: 0.3 }],
  [400, { depth: 2, multipv: 10, spread: 300, blunder: 0.18 }],
  [600, { depth: 3, multipv: 8, spread: 200, blunder: 0.11 }],
  [800, { depth: 4, multipv: 6, spread: 130, blunder: 0.07 }],
  [1000, { depth: 5, multipv: 5, spread: 80, blunder: 0.04 }],
  [1200, { depth: 6, multipv: 4, spread: 50, blunder: 0.02 }],
  [1320, { depth: 7, multipv: 3, spread: 35, blunder: 0.012 }]
];

export function weakSearch(elo: number): Weak {
  const e = Math.max(WEAK_ANCHORS[0]![0], Math.min(WEAK_ANCHORS.at(-1)![0], elo));
  let i = 0;
  while (i < WEAK_ANCHORS.length - 2 && WEAK_ANCHORS[i + 1]![0] <= e) i += 1;
  const [e0, a] = WEAK_ANCHORS[i]!;
  const [e1, b] = WEAK_ANCHORS[i + 1]!;
  const f = e1 === e0 ? 0 : (e - e0) / (e1 - e0);
  const mix = (x: number, y: number) => x + (y - x) * f;
  return {
    kind: 'weak',
    depth: Math.round(mix(a.depth, b.depth)),
    multipv: Math.round(mix(a.multipv, b.multipv)),
    spread: Math.round(mix(a.spread, b.spread)),
    blunder: Number(mix(a.blunder, b.blunder).toFixed(3))
  };
}

export function botSearch(bot: Bot): BotSearch {
  if (bot.elo < 1320) return weakSearch(bot.elo);
  if (bot.elo >= 3200) return { kind: 'full', movetime: 2000 };
  if (bot.elo >= 3000) return { kind: 'full', movetime: 1200 };
  return { kind: 'elo', elo: bot.elo, movetime: bot.elo >= 2000 ? 900 : 600 };
}

/** A bot's strength on the app's own small engine (1-5), used when Stockfish cannot load. */
export function fallbackLevel(bot: Bot): number {
  if (bot.elo <= 400) return 1;
  if (bot.elo <= 800) return 2;
  if (bot.elo <= 1200) return 3;
  if (bot.elo <= 1600) return 4;
  return 5;
}

/** Score in centipawns from the mover's view; mates count as very large. */
export function lineScore(line: { cp?: number; mate?: number }): number {
  if (line.mate !== undefined) return line.mate > 0 ? 100_000 - line.mate : -100_000 - line.mate;
  return line.cp ?? 0;
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * How much a bot of this style likes a move, in centipawns, on top of the engine's score. Only
 * matters between moves that are about as good, so a style colours the game without throwing it.
 */
export function styleBonus(fen: string, uci: string, style: BotStyle, ply: number, random: () => number = Math.random): number {
  if (style === 'balanced') return 0;
  if (style === 'chaos') return (random() - 0.5) * 160;
  let move;
  try {
    move = new Chess(fen).move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] });
  } catch {
    return 0;
  }
  const capture = move.captured ? VALUE[move.captured] ?? 0 : 0;
  const check = move.san.includes('+') || move.san.includes('#');
  const castle = move.flags.includes('k') || move.flags.includes('q');
  const forward = move.color === 'w' ? Number(move.to[1]) - Number(move.from[1]) : Number(move.from[1]) - Number(move.to[1]);
  switch (style) {
    case 'aggressive':
      return (capture > 0 ? 35 : 0) + (check ? 50 : 0) + (forward > 0 && move.piece !== 'k' ? 10 : 0);
    case 'defensive':
      return (castle ? 70 : 0) - (capture > 0 ? 15 : 0) - (check ? 10 : 0) + (forward < 0 ? 10 : 0);
    case 'queen':
      return (move.piece === 'q' && ply < 30 ? 70 : 0) + (move.piece === 'q' && capture > 0 ? 30 : 0);
    case 'pawns':
      return (move.piece === 'p' ? 55 : 0) + (move.piece === 'p' && (move.from[0] === 'a' || move.from[0] === 'h') ? 20 : 0);
    case 'trader':
      return capture >= 3 && capture >= VALUE[move.piece]! ? 70 : capture > 0 ? 25 : 0;
    case 'positional': {
      let b = castle ? 60 : 0;
      if (ply < 16 && move.piece === 'p' && (move.from[0] === 'd' || move.from[0] === 'e')) b += 30;
      if (move.piece === 'n' && (move.to[0] === 'a' || move.to[0] === 'h')) b -= 40;
      if (ply < 20 && (move.piece === 'n' || move.piece === 'b') && (move.from[1] === '1' || move.from[1] === '8')) b += 20;
      if (ply < 12 && move.piece === 'q') b -= 30;
      return b;
    }
  }
  return 0;
}

/**
 * Picks a weak bot's move from the engine's candidate lines (scores from the mover's view).
 * A mate in one is never missed and a move that allows mate is avoided when a safe one exists,
 * so even the weakest bots finish a won game.
 */
export function pickWeakMove(
  lines: readonly { move: string; cp?: number; mate?: number }[],
  legal: readonly string[],
  config: Weak,
  random: () => number = Math.random,
  bonus: (move: string) => number = () => 0
): string | null {
  if (lines.length === 0) return legal[0] ?? null;
  const mateInOne = lines.find((l) => l.mate === 1);
  if (mateInOne) return mateInOne.move;
  if (legal.length > 0 && random() < config.blunder) return legal[Math.floor(random() * legal.length)] ?? null;
  let pick = lines[0]!.move;
  let best = -Infinity;
  for (const line of lines) {
    const score = lineScore(line);
    // Walking into a forced mate is too big a gift unless every option does.
    const safe = !(line.mate !== undefined && line.mate < 0) || lines.every((l) => l.mate !== undefined && l.mate < 0);
    if (!safe) continue;
    const noisy = Math.max(-3000, Math.min(3000, score)) + (random() - 0.5) * 2 * config.spread + bonus(line.move);
    if (noisy > best) {
      best = noisy;
      pick = line.move;
    }
  }
  return pick;
}

/**
 * A strong bot keeps the engine's choice unless another line is nearly as good and suits its
 * style better. `chosen` is the engine's (strength-limited) move; lines are full-strength.
 */
export function pickStyledMove(
  chosen: string,
  lines: readonly { move: string; cp?: number; mate?: number }[],
  elo: number,
  bonus: (move: string) => number
): string {
  const own = lines.find((l) => l.move === chosen);
  if (!own) return chosen;
  const base = lineScore(own);
  const tolerance = elo < 2000 ? 30 : elo < 2600 ? 18 : 10;
  let pick = chosen;
  let best = bonus(chosen);
  for (const line of lines) {
    if (line.move === chosen || lineScore(line) < base - tolerance) continue;
    const b = bonus(line.move);
    if (b > best) {
      best = b;
      pick = line.move;
    }
  }
  return pick;
}

/** The next move from one of the bot's favourite openings, when the game is still in it. */
export function bookMove(bot: Bot, played: readonly string[], random: () => number = Math.random): string | null {
  const options: string[] = [];
  for (const line of bot.book ?? []) {
    const moves = line.split(' ');
    if (moves.length <= played.length) continue;
    if (played.every((m, i) => moves[i] === m)) options.push(moves[played.length]!);
  }
  if (options.length === 0) return null;
  return options[Math.floor(random() * options.length)] ?? null;
}
