// Game review: turns engine verdicts for every position of a game into move-by-move judgements
// (Brilliant ... Blunder), accuracy per player and a short explanation per move. Pure code: the
// engine work happens elsewhere and arrives here as PositionEval values.
//
// The scale is "win chance": an engine score turned into the chance (0-100) that the side wins,
// with the same curve Lichess publishes. A move is judged by how much win chance it gives away
// compared with the best move.

import { Chess, type Square } from 'chess.js';
import { openingOf, type Opening } from './openings.ts';
import { coachNotes } from './coach.ts';
import type { PositionEval } from './types.ts';

export type MoveKind =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

/** Display order for summaries, best first. */
export const MOVE_KINDS: readonly MoveKind[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

/** Kinds worth stopping at when stepping through your mistakes. */
export const BAD_KINDS: readonly MoveKind[] = ['inaccuracy', 'mistake', 'miss', 'blunder'];

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** White's chance to win (0-100) for a position. */
export function whiteWinChance(e: PositionEval | null | undefined): number {
  if (!e) return 50;
  if (e.over) return e.over === 'w' ? 100 : e.over === 'b' ? 0 : 50;
  if (e.mate !== undefined) return e.mate > 0 ? 100 : 0;
  const cp = Math.max(-2000, Math.min(2000, e.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** The chance for one side. */
export function winChance(e: PositionEval | null | undefined, side: 'w' | 'b'): number {
  const w = whiteWinChance(e);
  return side === 'w' ? w : 100 - w;
}

/** Win chance for a score given from White's point of view (cp or mate). */
function chanceOf(score: { cp?: number; mate?: number }, side: 'w' | 'b'): number {
  return winChance({ cp: score.cp, mate: score.mate }, side);
}

/** Accuracy of one move (0-100) from the win chance it lost: Lichess's published curve. */
export function moveAccuracy(loss: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

/** "+1.3", "-0.4", "M3", "-M2", "1-0" for an evaluation, from White's point of view. */
export function formatEval(e: PositionEval | null | undefined): string {
  if (!e) return '';
  if (e.over) return e.over === 'w' ? '1-0' : e.over === 'b' ? '0-1' : '½-½';
  if (e.mate !== undefined) return (e.mate < 0 ? '-M' : 'M') + Math.abs(e.mate);
  const pawns = (e.cp ?? 0) / 100;
  return (pawns > 0 ? '+' : '') + pawns.toFixed(1);
}

export interface MoveNote {
  /** i18n key under review.why.*, with parameters. */
  key: string;
  params?: Record<string, string | number>;
}

export interface ReviewedMove {
  /** 1-based half-move number in the game. */
  ply: number;
  color: 'w' | 'b';
  /** Move number as shown in a score sheet ("12"). */
  number: number;
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
  kind: MoveKind;
  /** Win chance given away, 0-100. */
  loss: number;
  accuracy: number;
  /** The engine's best move here, when it differs from the move played. */
  best?: { uci: string; san: string };
  /** The best line from the position before the move, in SAN. */
  bestLine: string[];
  /** The coach's first note (kept for older callers) and all notes for this move. */
  note?: MoveNote;
  notes: MoveNote[];
  phase: Phase;
}

export type Phase = 'opening' | 'middlegame' | 'endgame';
export const PHASES: readonly Phase[] = ['opening', 'middlegame', 'endgame'];

/** How well a side played a phase, from the accuracy of its moves there. */
export type PhaseGrade = 'great' | 'good' | 'ok' | 'poor';

export interface GameReview {
  moves: ReviewedMove[];
  accuracy: { w: number; b: number };
  counts: { w: Record<MoveKind, number>; b: Record<MoveKind, number> };
  opening: Opening | null;
  /** White's win chance after each position (index 0 = start). */
  graph: number[];
  /** A rough playing strength for each side in this game, from its accuracy. */
  rating: { w: number; b: number };
  /** Grade per phase and side; null when the side made no move in that phase. */
  phases: Record<Phase, { w: PhaseGrade | null; b: PhaseGrade | null }>;
  /** Half-moves worth stopping at: brilliant, great, and every slip. */
  keyMoments: number[];
}

/** SAN moves for a line of UCI moves from a position; stops at the first move that does not fit. */
export function sanLine(fen: string, uci: readonly string[], max = 8): string[] {
  const game = new Chess(fen);
  const out: string[] = [];
  for (const m of uci.slice(0, max)) {
    try {
      const move = game.move({ from: m.slice(0, 2) as Square, to: m.slice(2, 4) as Square, promotion: m[4] });
      out.push(move.san);
    } catch {
      break;
    }
  }
  return out;
}

/** Material balance from one side's point of view, in pawns. */
function balance(game: Chess, side: 'w' | 'b'): number {
  let score = 0;
  for (const row of game.board()) for (const sq of row) if (sq) score += (sq.color === side ? 1 : -1) * (VALUE[sq.type] ?? 0);
  return score;
}

/**
 * A real sacrifice: after the move, along the engine's best line, the mover is at some point at
 * least two pawns' worth of material down compared with before the move. A plain exchange
 * (take, take back) never dips that far.
 */
function isSacrifice(fenBefore: string, uci: string, pvAfter: readonly string[], side: 'w' | 'b'): boolean {
  const game = new Chess(fenBefore);
  const start = balance(game, side);
  try {
    game.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] });
  } catch {
    return false;
  }
  let low = balance(game, side);
  for (const m of pvAfter.slice(0, 4)) {
    try {
      game.move({ from: m.slice(0, 2) as Square, to: m.slice(2, 4) as Square, promotion: m[4] });
    } catch {
      break;
    }
    low = Math.min(low, balance(game, side));
  }
  // The material must not come straight back: compare with the end of the short line as well.
  return start - low >= 2 && start - balance(game, side) >= 1;
}

function emptyCounts(): Record<MoveKind, number> {
  return Object.fromEntries(MOVE_KINDS.map((k) => [k, 0])) as Record<MoveKind, number>;
}

/** Classifies one move from the verdicts before and after it. */
export function classifyMove(input: {
  side: 'w' | 'b';
  uci: string;
  before: PositionEval;
  after: PositionEval;
  /** Win chance the opponent gave away with the move before this one. */
  opponentLoss: number;
  book: boolean;
  legalMoves: number;
  sacrifice: boolean;
  /** The move takes back on the square where the opponent just captured. */
  recapture: boolean;
}): { kind: MoveKind; loss: number } {
  const { side, before, after } = input;
  const bestChance = winChance(before, side);
  const playedChance = winChance(after, side);
  const isBest = before.best === input.uci;
  const loss = isBest ? 0 : Math.max(0, bestChance - playedChance);

  if (input.book && loss < 10) return { kind: 'book', loss };
  if (input.legalMoves === 1) return { kind: 'best', loss: 0 };

  if (loss <= 2 && input.sacrifice && playedChance >= 50 && bestChance <= 97) return { kind: 'brilliant', loss };

  if (isBest && before.second && !input.recapture) {
    const secondChance = chanceOf(before.second, side);
    // The only move that keeps the position: every other move gives a lot away.
    if (bestChance - secondChance >= 20 && playedChance >= 35 && bestChance <= 97) return { kind: 'great', loss };
  }

  if (loss <= 0.5) return { kind: 'best', loss };
  if (loss < 2) return { kind: 'excellent', loss };
  if (loss < 5) return { kind: 'good', loss };
  // The opponent had just gone wrong and this move lets the chance slip.
  if (input.opponentLoss >= 10 && loss >= 10 && playedChance >= 30) return { kind: 'miss', loss };
  if (loss < 10) return { kind: 'inaccuracy', loss };
  if (loss < 20) return { kind: 'mistake', loss };
  return { kind: 'blunder', loss };
}

/** The verdict for a finished position (mate, stalemate, other draws), or null while it goes on. */
export function terminalEval(fen: string): PositionEval | null {
  const game = new Chess(fen);
  if (game.isCheckmate()) return { over: game.turn() === 'w' ? 'b' : 'w' };
  if (game.isDraw() || game.isStalemate() || game.isInsufficientMaterial() || game.isThreefoldRepetition()) return { over: 'draw' };
  return null;
}

/**
 * The phase of a position: the endgame once six or fewer pieces (not pawns or kings) are left,
 * the opening for the first ten moves while most pieces are still on, the middlegame between.
 */
export function phaseOf(fen: string, plyIndex: number): Phase {
  let pieces = 0;
  for (const ch of fen.split(' ')[0] ?? '') if ('nbrqNBRQ'.includes(ch)) pieces += 1;
  if (pieces <= 6) return 'endgame';
  if (plyIndex < 20 && pieces > 10) return 'opening';
  return 'middlegame';
}

export function phaseGrade(accuracy: number): PhaseGrade {
  if (accuracy >= 90) return 'great';
  if (accuracy >= 75) return 'good';
  if (accuracy >= 55) return 'ok';
  return 'poor';
}

function stdev(xs: readonly number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

/**
 * A side's accuracy over a game, the way Lichess publishes it: the mean of the move accuracies
 * weighted by how sharp the position was (calm moves count less), averaged with their harmonic
 * mean (so a few blunders pull the score down as they should).
 * `graph` is White's win chance per position; `moves` are all moves of the game.
 */
export function gameAccuracy(moves: readonly { color: 'w' | 'b'; accuracy: number; ply: number }[], graph: readonly number[], side: 'w' | 'b'): number {
  const mine = moves.filter((m) => m.color === side);
  if (mine.length === 0) return 0;
  const size = Math.max(2, Math.min(8, Math.floor(graph.length / 10)));
  const weightAt = (ply: number) => {
    const start = Math.max(0, Math.min(ply - 1, graph.length - size));
    return Math.max(0.5, Math.min(12, stdev(graph.slice(start, start + size))));
  };
  let sum = 0;
  let weights = 0;
  let inverse = 0;
  for (const m of mine) {
    const w = weightAt(m.ply);
    sum += m.accuracy * w;
    weights += w;
    inverse += 1 / Math.max(1, m.accuracy);
  }
  const weighted = sum / weights;
  const harmonic = mine.length / inverse;
  return Math.round(((weighted + harmonic) / 2) * 10) / 10;
}

const RATING_STEPS: readonly [number, number][] = [
  [0, 100], [30, 250], [50, 450], [60, 650], [70, 900], [80, 1250], [85, 1500], [90, 1850], [95, 2300], [98, 2700], [100, 3000]
];

/** A rough rating for one game from its accuracy, rounded to 50. An estimate, never exact. */
export function estimateRating(accuracy: number): number {
  const a = Math.max(0, Math.min(100, accuracy));
  for (let i = 1; i < RATING_STEPS.length; i += 1) {
    const [x1, y1] = RATING_STEPS[i]!;
    const [x0, y0] = RATING_STEPS[i - 1]!;
    if (a <= x1) return Math.round((y0 + ((a - x0) / (x1 - x0)) * (y1 - y0)) / 50) * 50;
  }
  return 3000;
}

const KEY_KINDS: readonly MoveKind[] = ['brilliant', 'great', 'miss', 'mistake', 'blunder'];

/** Reviews a whole game. `evals[i]` is the verdict for the position after i moves. */
export function reviewGame(startFen: string, movesUci: readonly string[], evals: readonly (PositionEval | null | undefined)[], fromStart: boolean): GameReview {
  const game = new Chess(startFen);
  const { bookPlies, opening } = openingOf(movesUci, fromStart);
  const moves: ReviewedMove[] = [];
  const counts = { w: emptyCounts(), b: emptyCounts() };
  const graph = [whiteWinChance(evals[0])];
  let previousLoss = 0;
  let previousTo = '';
  let previousCapture = false;

  movesUci.forEach((uci, i) => {
    const fenBefore = game.fen();
    const side = game.turn();
    const number = game.moveNumber();
    const legalMoves = game.moves().length;
    let move;
    try {
      move = game.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] });
    } catch {
      return;
    }
    const fenAfter = game.fen();
    const before = evals[i] ?? null;
    const after = evals[i + 1] ?? terminalEval(fenAfter);
    graph.push(whiteWinChance(after ?? before));
    const bestLine = before?.pv?.length ? sanLine(fenBefore, before.pv) : before?.best ? sanLine(fenBefore, [before.best]) : [];

    if (!before || !after) {
      moves.push({ ply: i + 1, color: side, number, uci, san: move.san, fenBefore, fenAfter, kind: i < bookPlies ? 'book' : 'good', loss: 0, accuracy: 100, bestLine, notes: [], phase: phaseOf(fenBefore, i) });
      return;
    }

    const recapture = previousCapture && move.to === previousTo && move.captured !== undefined;
    const sacrifice = isSacrifice(fenBefore, uci, after.pv ?? [], side);
    const { kind, loss } = classifyMove({
      side,
      uci,
      before,
      after,
      opponentLoss: previousLoss,
      book: i < bookPlies,
      legalMoves,
      sacrifice,
      recapture
    });
    const accuracy = kind === 'book' ? 100 : moveAccuracy(loss);
    counts[side][kind] += 1;

    const reviewed: ReviewedMove = { ply: i + 1, color: side, number, uci, san: move.san, fenBefore, fenAfter, kind, loss, accuracy, bestLine, notes: [], phase: phaseOf(fenBefore, i) };
    if (before.best && before.best !== uci && loss >= 2) {
      const best = sanLine(fenBefore, [before.best])[0];
      if (best) reviewed.best = { uci: before.best, san: best };
    }
    reviewed.notes = coachNotes({ kind, side, uci, fenBefore, before, after, plyIndex: i, recapture, opening });
    reviewed.note = reviewed.notes[0];
    moves.push(reviewed);

    previousLoss = kind === 'book' ? 0 : loss;
    previousTo = move.to;
    previousCapture = move.captured !== undefined;
  });

  const accuracy = { w: gameAccuracy(moves, graph, 'w'), b: gameAccuracy(moves, graph, 'b') };
  const phases = Object.fromEntries(
    PHASES.map((phase) => {
      const grade = (side: 'w' | 'b') => {
        const ms = moves.filter((m) => m.phase === phase && m.color === side && m.kind !== 'book');
        if (ms.length === 0) return moves.some((m) => m.phase === phase && m.color === side) ? 'great' : null;
        return phaseGrade(ms.reduce((a, m) => a + m.accuracy, 0) / ms.length);
      };
      return [phase, { w: grade('w'), b: grade('b') }];
    })
  ) as GameReview['phases'];
  const keyMoments = moves.filter((m) => KEY_KINDS.includes(m.kind)).map((m) => m.ply);
  return {
    moves,
    accuracy,
    counts,
    opening,
    graph,
    rating: { w: estimateRating(accuracy.w), b: estimateRating(accuracy.b) },
    phases,
    keyMoments
  };
}
