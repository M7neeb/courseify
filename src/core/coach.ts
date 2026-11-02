// The coach's words for one reviewed move: what the move does, what goes wrong with it, and what
// would have been better. Pure code over chess.js and the engine verdicts, so it is unit tested.
//
// Each note is an i18n key under review.why.* with parameters. Piece names are given as `pawn`,
// `knight`, ... and translated by the screen.

import { Chess, type Move, type Square } from 'chess.js';
import type { PositionEval } from './types.ts';

export interface CoachNote {
  key: string;
  params?: Record<string, string | number>;
}

type Kind = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder';
const BAD = new Set<Kind>(['inaccuracy', 'mistake', 'miss', 'blunder']);

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const PIECE_NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function play(game: Chess, uci: string): Move | null {
  try {
    return game.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] });
  } catch {
    return null;
  }
}

/** Material from one side's point of view, kings left out. */
function balance(game: Chess, side: 'w' | 'b'): number {
  let score = 0;
  for (const row of game.board()) for (const sq of row) if (sq && sq.type !== 'k') score += (sq.color === side ? 1 : -1) * (VALUE[sq.type] ?? 0);
  return score;
}

/**
 * What the piece on `square` attacks that matters: the king, anything worth more than the
 * attacker, and undefended pieces (pawns left out). Sorted by value, biggest first.
 */
export function targetsOf(game: Chess, square: Square): { square: Square; type: string }[] {
  const piece = game.get(square);
  if (!piece) return [];
  const enemy = piece.color === 'w' ? 'b' : 'w';
  const out: { square: Square; type: string }[] = [];
  for (const row of game.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== enemy) continue;
      if (!game.attackers(sq.square, piece.color).includes(square)) continue;
      const defended = sq.type !== 'k' && game.attackers(sq.square, enemy).length > 0;
      const worthMore = (VALUE[sq.type] ?? 0) > (VALUE[piece.type] ?? 0);
      if (sq.type === 'k' || worthMore || (!defended && sq.type !== 'p')) out.push({ square: sq.square, type: sq.type });
    }
  }
  return out.sort((a, b) => (VALUE[b.type] ?? 0) - (VALUE[a.type] ?? 0));
}

/** A fork: the moved piece hits two or more targets at once, and is not simply lost for one of them. */
function forkBy(game: Chess, move: Move): { piece: string; a: string; b: string } | null {
  const targets = targetsOf(game, move.to);
  if (targets.length < 2) return null;
  // A cheap piece forking dearer ones works even when it can be taken; otherwise it must be safe.
  const enemy = move.color === 'w' ? 'b' : 'w';
  const taken = game.attackers(move.to, enemy).length > 0;
  const cheapest = Math.min(...targets.map((t) => VALUE[t.type] ?? 0));
  if (taken && (VALUE[move.piece] ?? 0) >= cheapest && !game.inCheck()) return null;
  return { piece: PIECE_NAME[move.piece] ?? 'piece', a: PIECE_NAME[targets[0]!.type] ?? '', b: PIECE_NAME[targets[1]!.type] ?? '' };
}

/**
 * The piece a line wins for the side to move: the first capture of a knight or more, when the
 * material really changes hands (two pawns' worth or more after a few half-moves).
 */
export function pieceWonBy(fen: string, line: readonly string[] | undefined): string | null {
  if (!line?.length) return null;
  const game = new Chess(fen);
  const side = game.turn();
  const start = balance(game, side);
  let first: string | null = null;
  for (const m of line.slice(0, 4)) {
    const mv = play(game, m);
    if (!mv) break;
    if (!first && mv.color === side && mv.captured && (VALUE[mv.captured] ?? 0) >= 3) first = PIECE_NAME[mv.captured] ?? null;
  }
  return first && balance(game, side) - start >= 2 ? first : null;
}

const CENTRE = new Set(['d4', 'e4', 'd5', 'e5']);

export interface CoachInput {
  kind: Kind;
  side: 'w' | 'b';
  uci: string;
  fenBefore: string;
  /** Verdict before the move (best line for the mover) and after it (best line for the opponent). */
  before: PositionEval | null;
  after: PositionEval | null;
  /** Half-moves played before this one. */
  plyIndex: number;
  /** The move takes back on the square where the opponent just captured. */
  recapture: boolean;
  opening?: { en: string; de: string } | null;
}

/** Up to two notes for one move, in the order a coach would say them. */
export function coachNotes(input: CoachInput): CoachNote[] {
  const { kind, side, uci, fenBefore, before, after } = input;
  const game = new Chess(fenBefore);
  const move = play(game, uci);
  if (!move) return [];
  if (game.isCheckmate()) return [{ key: 'checkmate' }];
  if (kind === 'book') return [input.opening ? { key: 'book', params: { name: input.opening.en, nameDe: input.opening.de } } : { key: 'bookPlain' }];

  const sign = side === 'w' ? 1 : -1;
  const mateFor = (e: PositionEval | null) => (e?.mate !== undefined ? e.mate * sign : undefined);
  const hadMate = mateFor(before);
  const nowMate = mateFor(after);
  const notes: CoachNote[] = [];

  if (BAD.has(kind)) {
    // What goes wrong.
    if (nowMate !== undefined && nowMate < 0 && !(hadMate !== undefined && hadMate < 0)) notes.push({ key: 'allowsMate', params: { n: Math.abs(nowMate) } });
    else {
      const reply = after?.pv ?? (after?.best ? [after.best] : []);
      const lost = pieceWonBy(game.fen(), reply);
      const replyFork = reply[0] ? (() => {
        const g = new Chess(game.fen());
        const mv = play(g, reply[0]!);
        return mv ? forkBy(g, mv) : null;
      })() : null;
      if (replyFork) notes.push({ key: 'allowsFork', params: { piece: replyFork.piece } });
      else if (lost) notes.push({ key: 'hangs', params: { piece: lost } });
    }
    // What was better.
    const bestLine = before?.pv ?? (before?.best ? [before.best] : []);
    if (hadMate !== undefined && hadMate > 0 && (nowMate === undefined || nowMate <= 0)) notes.push({ key: 'missedMate', params: { n: hadMate } });
    else if (bestLine[0]) {
      const g = new Chess(fenBefore);
      const bm = play(g, bestLine[0]);
      const fork = bm ? forkBy(g, bm) : null;
      const won = pieceWonBy(fenBefore, bestLine);
      if (fork && won) notes.push({ key: 'bestForks', params: { piece: fork.piece } });
      else if (won) notes.push({ key: 'couldWin', params: { piece: won } });
    }
    if (notes.length === 0) notes.push({ key: kind === 'miss' ? 'missed' : kind === 'inaccuracy' ? 'slightlyWorse' : 'worse' });
    return notes.slice(0, 2);
  }

  // Good moves: say what the move does.
  if (kind === 'brilliant') notes.push({ key: 'sacrifice' });
  else if (kind === 'great') notes.push({ key: 'onlyMove' });
  if (nowMate !== undefined && nowMate > 0) notes.push({ key: 'forcesMate', params: { n: nowMate } });

  const fork = forkBy(game, move);
  const won = pieceWonBy(fenBefore, [uci, ...(after?.pv ?? [])]);
  if (move.promotion) notes.push({ key: 'promotes', params: { piece: PIECE_NAME[move.promotion] ?? 'queen' } });
  else if (fork) notes.push({ key: 'fork', params: fork });
  else if (move.captured && input.recapture) notes.push({ key: 'recaptures', params: { piece: PIECE_NAME[move.captured] ?? '' } });
  else if (move.captured && won) notes.push({ key: 'winsPiece', params: { piece: won } });
  else if (move.captured && VALUE[move.captured] === VALUE[move.piece]) notes.push({ key: 'trades', params: { piece: PIECE_NAME[move.captured] ?? '' } });
  else if (move.captured) notes.push({ key: 'captures', params: { piece: PIECE_NAME[move.captured] ?? '' } });
  else if (move.isKingsideCastle() || move.isQueensideCastle()) notes.push({ key: 'castles' });
  else if (game.inCheck()) notes.push({ key: 'check' });
  else {
    const targets = targetsOf(game, move.to).filter((t) => t.type !== 'k');
    const backRank = side === 'w' ? '1' : '8';
    if (targets[0]) notes.push({ key: 'attacks', params: { piece: PIECE_NAME[targets[0].type] ?? '' } });
    else if ((move.piece === 'n' || move.piece === 'b') && move.from[1] === backRank && input.plyIndex < 30) notes.push({ key: 'develops', params: { piece: PIECE_NAME[move.piece] ?? '' } });
    else if (move.piece === 'p' && CENTRE.has(move.to) && input.plyIndex < 20) notes.push({ key: 'centre' });
  }
  if (notes.length === 0) notes.push({ key: kind === 'best' ? 'bestPlain' : kind === 'excellent' ? 'excellentPlain' : 'goodPlain' });
  return notes.slice(0, 2);
}
