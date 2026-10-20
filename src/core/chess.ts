// Chess helpers for puzzle questions and chess blocks. Rules come from chess.js; this module turns
// course data (a FEN and a line of moves in SAN or UCI) into checked, normalized lines, grades a
// learner's moves and formats lines for people.
//
// A puzzle question:  { kind: 'chess', fen, solution: ['Nf7+', 'Kg8', 'Nh6#'], lastMove?: 'e7e5' }
// The side to move in `fen` is the learner; the solution alternates learner move, reply, learner
// move ... and always ends with a learner move. Any move that gives checkmate is also accepted.

import { Chess, type Move, type Square } from 'chess.js';
import type { Course, Question } from './types.ts';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const UCI = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

export type Color = 'w' | 'b';

/** An arrow drawn on the board, from one square to another. */
export interface BoardArrow {
  from: string;
  to: string;
  tone?: 'hint' | 'good' | 'bad' | 'plan';
}

/** A new game at a position, or null when the FEN is not a legal position. */
export function gameAt(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/** Plays one move given as SAN ("Nf3", "exd5", "O-O", "e8=Q+") or UCI ("g1f3", "e7e8q"). */
export function playMove(game: Chess, move: string): Move | null {
  const text = move.trim();
  const uci = UCI.exec(text);
  try {
    if (uci) return game.move({ from: uci[1] as Square, to: uci[2] as Square, promotion: uci[3] });
    // Accept decorations people write: "Nf3!", "Qxf7#", "e4?!", "0-0".
    return game.move(text.replace(/[!?]+$/u, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O'));
  } catch {
    return null;
  }
}

export function uciOf(move: Pick<Move, 'from' | 'to' | 'promotion'>): string {
  return move.from + move.to + (move.promotion ?? '');
}

export interface Line {
  uci: string[];
  san: string[];
  /** Position after each move (index i = after move i). */
  fens: string[];
}

/** A line of moves from a position, normalized to UCI and SAN, or null with the first bad move. */
export function readLine(fen: string, moves: readonly string[]): { line: Line } | { error: string; index: number } {
  const game = gameAt(fen);
  if (!game) return { error: 'not a legal position (FEN)', index: -1 };
  const line: Line = { uci: [], san: [], fens: [] };
  for (const [index, move] of moves.entries()) {
    if (typeof move !== 'string') return { error: 'a move must be text', index };
    const played = playMove(game, move);
    if (!played) return { error: `"${move}" is not a legal move here`, index };
    line.uci.push(uciOf(played));
    line.san.push(played.san);
    line.fens.push(game.fen());
  }
  return { line };
}

export function sideToMove(fen: string): Color {
  return fen.split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

/** Number of learner moves in a solution line (it alternates learner, reply, learner, ...). */
export function learnerMoveCount(solution: readonly unknown[]): number {
  return Math.ceil(solution.length / 2);
}

/** The puzzle's lines (main solution first, then accepted alternatives), normalized to UCI. */
export function puzzleLines(q: Pick<Question, 'fen' | 'solution' | 'alternatives'>): string[][] {
  const out: string[][] = [];
  if (typeof q.fen !== 'string') return out;
  for (const moves of [q.solution, ...(q.alternatives ?? [])]) {
    if (!Array.isArray(moves)) continue;
    const read = readLine(q.fen, moves);
    if ('line' in read) out.push(read.line.uci);
  }
  return out;
}

export type PuzzleStep =
  /** The move is right and the puzzle goes on: the opponent answers with `reply`. */
  | { kind: 'continue'; reply: string }
  /** The move finishes the puzzle. */
  | { kind: 'solved' }
  | { kind: 'wrong' };

/**
 * Judges the learner's next move, given the moves played so far (learner and replies, UCI).
 * A move is right when it follows an accepted line, or when it gives checkmate.
 */
export function judgeMove(q: Pick<Question, 'fen' | 'solution' | 'alternatives'>, played: readonly string[], move: string): PuzzleStep {
  const lines = puzzleLines(q);
  const ply = played.length;
  const following = lines.filter((line) => played.every((m, i) => line[i] === m) && line[ply] === move);
  if (following.length > 0) {
    const main = following[0] as string[];
    const reply = main[ply + 1];
    return reply ? { kind: 'continue', reply } : { kind: 'solved' };
  }
  if (typeof q.fen === 'string' && givesMate(q.fen, [...played, move])) return { kind: 'solved' };
  return { kind: 'wrong' };
}

function givesMate(fen: string, moves: readonly string[]): boolean {
  const read = readLine(fen, moves);
  if (!('line' in read)) return false;
  const last = read.line.fens.at(-1);
  return last !== undefined && (gameAt(last)?.isCheckmate() ?? false);
}

/** Grades a whole attempt: the learner's moves plus the replies, as UCI. */
export function gradeChess(q: Question, given: unknown): boolean {
  if (!Array.isArray(given) || given.length === 0 || !given.every((m) => typeof m === 'string')) return false;
  const moves = given as string[];
  // Replay move by move: every learner move must be judged right and every reply must be the
  // line's reply, and the last learner move must finish the puzzle.
  for (let ply = 0; ply < moves.length; ply += 2) {
    const step = judgeMove(q, moves.slice(0, ply), moves[ply] as string);
    if (step.kind === 'wrong') return false;
    if (step.kind === 'solved') return ply === moves.length - 1;
    if (moves[ply + 1] !== undefined && moves[ply + 1] !== step.reply) return false;
  }
  return false;
}

/** "1. Nf3 d5 2. g3" or "12... Qxd4 13. Nxd4" with move numbers taken from the FEN. */
export function formatLine(fen: string, uciOrSan: readonly string[]): string {
  const read = readLine(fen, uciOrSan);
  const san = 'line' in read ? read.line.san : [...uciOrSan];
  const parts = fen.split(/\s+/);
  let number = Number(parts[5]) || 1;
  let white = parts[1] !== 'b';
  const out: string[] = [];
  san.forEach((move, i) => {
    if (white) out.push(`${number}. ${move}`);
    else out.push(i === 0 ? `${number}... ${move}` : move);
    if (!white) number += 1;
    white = !white;
  });
  return out.join(' ');
}

/** Problems with a chess question's data, as readable messages (empty when it is fine). */
export function chessQuestionErrors(q: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (typeof q.fen !== 'string' || !gameAt(q.fen)) {
    errors.push('fen: must be a legal position in FEN notation.');
    return errors;
  }
  const fen = q.fen;
  if (!Array.isArray(q.solution) || q.solution.length === 0) {
    errors.push('solution: needs the moves, for example ["Nf7+", "Kg8", "Nh6#"].');
  } else {
    const read = readLine(fen, q.solution as string[]);
    if ('error' in read) errors.push(`solution[${read.index}]: ${read.error}.`);
    else if (q.solution.length % 2 === 0) errors.push('solution: must end with the learner\'s move (an odd number of moves).');
  }
  if (q.alternatives !== undefined) {
    if (!Array.isArray(q.alternatives)) errors.push('alternatives: must be a list of move lists.');
    else
      q.alternatives.forEach((alt, ai) => {
        const read = Array.isArray(alt) ? readLine(fen, alt as string[]) : { error: 'must be a list of moves', index: -1 };
        if ('error' in read) errors.push(`alternatives[${ai}]: ${read.error}.`);
      });
  }
  if (q.lastMove !== undefined && (typeof q.lastMove !== 'string' || !UCI.test(q.lastMove))) {
    errors.push('lastMove: must be a move in UCI form such as "e7e5".');
  }
  return errors;
}

/** The squares a piece on `from` can move to, for the board's move dots. */
export function legalTargets(game: Chess): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of game.moves({ verbose: true })) {
    const list = out.get(m.from) ?? [];
    if (!list.includes(m.to)) list.push(m.to);
    out.set(m.from, list);
  }
  return out;
}

/** Plain-language name of the piece that makes a move, for hints ("your knight"). */
export function pieceAt(fen: string, square: string): { type: string; color: Color } | null {
  const game = gameAt(fen);
  const piece = game?.get(square as Square);
  return piece ? { type: piece.type, color: piece.color } : null;
}

// ---------- chess blocks ----------
//
// { type: 'chess', mode: 'show', fen?, steps: [{ move?, note?, arrows?, highlights? }] }
//   A worked example: step through the moves, each with a short note, arrows and marked squares.
// { type: 'chess', mode: 'play', fen, goal: 'mate' | 'promote' | 'hold' | 'free', prompt?, level?, maxMoves? }
//   Play the position out against the computer until the goal is reached.

export type PlayGoal = 'mate' | 'promote' | 'hold' | 'free';
export const PLAY_GOALS: readonly PlayGoal[] = ['mate', 'promote', 'hold', 'free'];

export interface ShowStep {
  move?: string;
  note?: string;
  /** Arrows as "e2e4" (from + to), drawn on the position after this step. */
  arrows?: string[];
  /** Squares to mark, such as "f7". */
  highlights?: string[];
}

const SQUARE = /^[a-h][1-8]$/;
const ARROW = /^[a-h][1-8][a-h][1-8]$/;

export function chessBlockErrors(b: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const mode = b.mode ?? 'show';
  const fen = b.fen === undefined ? START_FEN : b.fen;
  if (typeof fen !== 'string' || !gameAt(fen)) {
    errors.push('fen: must be a legal position in FEN notation.');
    return errors;
  }
  const marks = (value: unknown, path: string) => {
    if (value === undefined) return;
    if (!Array.isArray(value)) errors.push(`${path}: must be a list.`);
  };
  marks(b.arrows, 'arrows');
  marks(b.highlights, 'highlights');
  if (Array.isArray(b.arrows) && !b.arrows.every((a) => typeof a === 'string' && ARROW.test(a))) errors.push('arrows: use "e2e4" (from and to square).');
  if (Array.isArray(b.highlights) && !b.highlights.every((h) => typeof h === 'string' && SQUARE.test(h))) errors.push('highlights: use squares such as "f7".');
  if (b.orientation !== undefined && b.orientation !== 'white' && b.orientation !== 'black') errors.push('orientation: "white" or "black".');
  if (mode === 'show') {
    if (b.steps !== undefined && !Array.isArray(b.steps)) {
      errors.push('steps: must be a list of { move, note } steps.');
      return errors;
    }
    const steps = (b.steps ?? []) as unknown[];
    const game = gameAt(fen) as Chess;
    steps.forEach((raw, i) => {
      if (typeof raw !== 'object' || raw === null) {
        errors.push(`steps[${i}]: must be an object.`);
        return;
      }
      const step = raw as Record<string, unknown>;
      if (step.move !== undefined) {
        if (typeof step.move !== 'string' || !playMove(game, step.move)) errors.push(`steps[${i}].move: "${String(step.move)}" is not a legal move here.`);
      }
      if (step.note !== undefined && typeof step.note !== 'string') errors.push(`steps[${i}].note: must be text.`);
      if (step.arrows !== undefined && (!Array.isArray(step.arrows) || !step.arrows.every((a) => typeof a === 'string' && ARROW.test(a)))) {
        errors.push(`steps[${i}].arrows: use "e2e4" (from and to square).`);
      }
      if (step.highlights !== undefined && (!Array.isArray(step.highlights) || !step.highlights.every((h) => typeof h === 'string' && SQUARE.test(h)))) {
        errors.push(`steps[${i}].highlights: use squares such as "f7".`);
      }
    });
  } else if (mode === 'play') {
    if (b.goal !== undefined && !PLAY_GOALS.includes(b.goal as PlayGoal)) errors.push(`goal: one of ${PLAY_GOALS.join(', ')}.`);
    if (b.level !== undefined && !(Number.isInteger(b.level) && (b.level as number) >= 1 && (b.level as number) <= 5)) errors.push('level: a whole number from 1 to 5.');
    if (b.maxMoves !== undefined && !(Number.isInteger(b.maxMoves) && (b.maxMoves as number) >= 1)) errors.push('maxMoves: a whole number of moves.');
    const game = gameAt(fen) as Chess;
    if (game.isGameOver()) errors.push('fen: the game is already over in this position.');
  } else {
    errors.push('mode: "show" or "play".');
  }
  return errors;
}

/** The result of a play-out after the learner's or the computer's move, or null while it goes on. */
export function playOutcome(
  game: Chess,
  goal: PlayGoal,
  learner: Color,
  learnerMoves: number,
  maxMoves: number | undefined,
  lastMove: Move | null
): { result: 'won' | 'lost'; reason: string } | null {
  if (game.isCheckmate()) {
    // The side to move is mated.
    const mated = game.turn();
    if (mated === learner) return { result: 'lost', reason: 'mated' };
    return goal === 'hold' || goal === 'mate' || goal === 'free' || goal === 'promote' ? { result: 'won', reason: 'mate' } : null;
  }
  if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition() || game.isInsufficientMaterial()) {
    const reason = game.isStalemate() ? 'stalemate' : game.isInsufficientMaterial() ? 'material' : game.isThreefoldRepetition() ? 'repetition' : 'fifty';
    return goal === 'hold' ? { result: 'won', reason } : { result: 'lost', reason };
  }
  if (goal === 'promote' && lastMove && lastMove.color === learner && lastMove.promotion) return { result: 'won', reason: 'promoted' };
  if (maxMoves !== undefined && learnerMoves >= maxMoves && game.turn() === learner) {
    return goal === 'hold' ? { result: 'won', reason: 'held' } : { result: 'lost', reason: 'moves' };
  }
  return null;
}

/** True when a course has any chess block or puzzle, so chess tools are worth showing. */
export function courseHasChess(course: Course): boolean {
  const hasPuzzle = (questions: unknown) => Array.isArray(questions) && questions.some((q) => (q as { kind?: string })?.kind === 'chess');
  return course.modules.some(
    (m) => hasPuzzle(m.test?.questions) || m.lessons.some((l) => l.blocks.some((b) => b.type === 'chess' || hasPuzzle(b.questions)))
  );
}
