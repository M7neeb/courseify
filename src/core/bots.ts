// The chess bots: a ladder of opponents from someone who just learnt the moves to the engine at
// full strength. Ratings are approximate. From 1320 up Stockfish's own strength limit is used;
// below that the bot takes the engine's top moves and picks among them with deliberate,
// human-looking mistakes.

export interface Bot {
  id: string;
  name: string;
  elo: number;
  /** Avatar colour. */
  color: string;
  /** A chess piece shown in the avatar. */
  piece: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
}

export type BotGroup = 'beginner' | 'intermediate' | 'advanced' | 'master';

export const BOTS: readonly Bot[] = [
  { id: 'pip', name: 'Pip', elo: 250, color: '#8fb8de', piece: 'p' },
  { id: 'juna', name: 'Juna', elo: 400, color: '#f2a65a', piece: 'p' },
  { id: 'theo', name: 'Theo', elo: 600, color: '#9bc77a', piece: 'n' },
  { id: 'mara', name: 'Mara', elo: 800, color: '#e88aa8', piece: 'n' },
  { id: 'ravi', name: 'Ravi', elo: 1000, color: '#7fc8b8', piece: 'b' },
  { id: 'lena', name: 'Lena', elo: 1200, color: '#c39be0', piece: 'b' },
  { id: 'oskar', name: 'Oskar', elo: 1400, color: '#e0b84a', piece: 'r' },
  { id: 'sofia', name: 'Sofia', elo: 1600, color: '#6aa6e8', piece: 'r' },
  { id: 'kenji', name: 'Kenji', elo: 1800, color: '#e07a5f', piece: 'q' },
  { id: 'amara', name: 'Amara', elo: 2000, color: '#5fb37a', piece: 'q' },
  { id: 'viktor', name: 'Viktor', elo: 2200, color: '#8a8fd6', piece: 'k' },
  { id: 'ingrid', name: 'Ingrid', elo: 2500, color: '#d6697a', piece: 'k' },
  { id: 'max', name: 'Max', elo: 3000, color: '#4a5568', piece: 'k' }
];

export function botById(id: string): Bot | undefined {
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

const WEAK: Record<number, Extract<BotSearch, { kind: 'weak' }>> = {
  250: { kind: 'weak', depth: 1, multipv: 12, spread: 500, blunder: 0.3 },
  400: { kind: 'weak', depth: 2, multipv: 10, spread: 300, blunder: 0.18 },
  600: { kind: 'weak', depth: 3, multipv: 8, spread: 200, blunder: 0.11 },
  800: { kind: 'weak', depth: 4, multipv: 6, spread: 130, blunder: 0.07 },
  1000: { kind: 'weak', depth: 5, multipv: 5, spread: 80, blunder: 0.04 },
  1200: { kind: 'weak', depth: 6, multipv: 4, spread: 50, blunder: 0.02 }
};

export function botSearch(bot: Bot): BotSearch {
  const weak = WEAK[bot.elo];
  if (weak) return weak;
  if (bot.elo >= 3000) return { kind: 'full', movetime: 1200 };
  return { kind: 'elo', elo: Math.max(1320, bot.elo), movetime: bot.elo >= 2000 ? 900 : 600 };
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

/**
 * Picks a weak bot's move from the engine's candidate lines (scores from the mover's view).
 * A mate in one is never missed and a move that allows mate is avoided when a safe one exists,
 * so even the weakest bots finish a won game.
 */
export function pickWeakMove(
  lines: readonly { move: string; cp?: number; mate?: number }[],
  legal: readonly string[],
  config: Extract<BotSearch, { kind: 'weak' }>,
  random: () => number = Math.random
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
    const noisy = Math.max(-3000, Math.min(3000, score)) + (random() - 0.5) * 2 * config.spread;
    if (noisy > best) {
      best = noisy;
      pick = line.move;
    }
  }
  return pick;
}
