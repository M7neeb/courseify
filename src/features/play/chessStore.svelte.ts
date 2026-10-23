// The Chess section's data: saved games against the bots, endgame records, and the game review
// analysis, which keeps running in the background while the app is open and saves as it goes.

import { Chess, type Square } from 'chess.js';
import { storage } from '../../core/storage.ts';
import { SYNCED_EVENT } from '../../core/syncMerge.ts';
import { terminalEval } from '../../core/review.ts';
import { botById, botSearch, fallbackLevel, pickWeakMove } from '../../core/bots.ts';
import type { ChessRecord, PositionEval, SavedGame } from '../../core/types.ts';
import { analyse, type EngineLine } from '../../ui/chess/stockfish.ts';
import { think } from '../../ui/chess/engine.ts';

/** How deep the review looks at every position. */
export const REVIEW_DEPTH = 14;

export const chess = $state({
  loaded: false,
  games: [] as SavedGame[],
  record: { endgames: {} } as ChessRecord,
  /** Review progress per game id: positions done and total. */
  analysing: {} as Record<string, { done: number; total: number; failed?: boolean }>
});

let loading: Promise<void> | null = null;

export function loadChess(): Promise<void> {
  loading ??= (async () => {
    try {
      const [games, record] = await Promise.all([storage.listGames(), storage.getChess()]);
      chess.games = games.sort((a, b) => (b.startedAt < a.startedAt ? -1 : 1));
      chess.record = record;
    } catch {
      // Storage blocked: the section still works, games are just not kept.
    }
    chess.loaded = true;
  })();
  return loading;
}

// A sync may have brought games from the other device.
if (typeof window !== 'undefined') {
  window.addEventListener(SYNCED_EVENT, () => {
    if (!chess.loaded) return;
    loading = null;
    void loadChess();
  });
}

export function gameById(id: string): SavedGame | undefined {
  return chess.games.find((g) => g.id === id);
}

/** The unfinished game, if one is waiting to be continued. */
export function unfinishedGame(): SavedGame | undefined {
  return chess.games.find((g) => !g.result);
}

export async function saveGame(game: SavedGame): Promise<void> {
  const plain = $state.snapshot(game) as SavedGame;
  const i = chess.games.findIndex((g) => g.id === game.id);
  if (i >= 0) chess.games[i] = plain;
  else chess.games = [plain, ...chess.games];
  try {
    await storage.saveGame(plain);
  } catch {
    /* not kept, but the game goes on */
  }
}

export async function deleteGame(id: string): Promise<void> {
  chess.games = chess.games.filter((g) => g.id !== id);
  try {
    await storage.deleteGame(id);
  } catch {
    /* already gone from the list */
  }
}

export async function recordEndgame(id: string, moves: number): Promise<void> {
  const old = chess.record.endgames[id];
  const bestMoves = old?.bestMoves !== undefined ? Math.min(old.bestMoves, moves) : moves;
  chess.record.endgames[id] = { done: true, bestMoves, at: new Date().toISOString() };
  try {
    await storage.saveChess($state.snapshot(chess.record) as ChessRecord);
  } catch {
    /* not kept */
  }
}

export function newGameId(): string {
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function legalUci(fen: string): string[] {
  return new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
}

/** The bot's move in a position, with a short human-feeling pause. Never throws. */
export async function botMove(fen: string, botId: string): Promise<string | null> {
  const bot = botById(botId);
  const started = Date.now();
  let move: string | null = null;
  if (bot) {
    const s = botSearch(bot);
    try {
      if (s.kind === 'weak') {
        const r = await analyse(fen, { depth: s.depth, multipv: s.multipv });
        if (r) move = pickWeakMove(r.lines, legalUci(fen), s);
      } else {
        const r = await analyse(fen, s.kind === 'elo' ? { movetime: s.movetime, elo: s.elo } : { movetime: s.movetime });
        if (r) move = r.bestmove;
      }
    } catch {
      move = null;
    }
    // Stockfish could not load (offline before its first download): the app's own engine plays.
    if (!move) move = (await think(fen, fallbackLevel(bot), 0)).move;
  }
  const wait = 550 + Math.random() * 450 - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return move;
}

/** The engine's best move for a hint, or null. */
export async function bestMoveFor(fen: string): Promise<string | null> {
  const r = await analyse(fen, { depth: 14, movetime: 1500 });
  return r?.bestmove ?? (await think(fen, 5, 0)).move;
}

/** Positions of a game: index 0 is the start, index i the position after i moves. */
export function gameFens(game: Pick<SavedGame, 'startFen' | 'moves'>): string[] {
  const g = new Chess(game.startFen);
  const out = [g.fen()];
  for (const m of game.moves) {
    try {
      g.move({ from: m.slice(0, 2) as Square, to: m.slice(2, 4) as Square, promotion: m[4] });
    } catch {
      break;
    }
    out.push(g.fen());
  }
  return out;
}

/** Turns engine lines (side to move's view) into a stored verdict (White's view). */
export function toPositionEval(fen: string, lines: readonly EngineLine[]): PositionEval | null {
  const top = lines[0];
  if (!top) return null;
  const sign = fen.split(' ')[1] === 'b' ? -1 : 1;
  const e: PositionEval = { best: top.move, pv: top.pv.slice(0, 10) };
  if (top.mate !== undefined) e.mate = top.mate * sign;
  else e.cp = (top.cp ?? 0) * sign;
  const second = lines[1];
  if (second) e.second = second.mate !== undefined ? { move: second.move, mate: second.mate * sign } : { move: second.move, cp: (second.cp ?? 0) * sign };
  return e;
}

const running = new Set<string>();

/** True when every position of the game has a verdict. */
export function isReviewed(game: SavedGame): boolean {
  const total = game.moves.length + 1;
  return (game.evals?.length ?? 0) >= total && (game.evals ?? []).slice(0, total).every((e) => e !== null && e !== undefined);
}

/**
 * Analyses every position of a game that has no verdict yet, saving every few positions so a
 * closed app picks up where it stopped. Resolves when done, or false when the engine is missing.
 */
export async function runReview(id: string): Promise<boolean> {
  if (running.has(id)) return true;
  const game = gameById(id);
  if (!game) return false;
  running.add(id);
  const fens = gameFens(game);
  const evals: (PositionEval | null)[] = Array.from({ length: fens.length }, (_, i) => game.evals?.[i] ?? null);
  const total = fens.length;
  chess.analysing[id] = { done: evals.filter(Boolean).length, total };
  let ok = true;
  try {
    for (let i = 0; i < fens.length; i += 1) {
      if (evals[i]) continue;
      const fen = fens[i] as string;
      const done = terminalEval(fen);
      if (done) evals[i] = done;
      else {
        const r = await analyse(fen, { depth: REVIEW_DEPTH, movetime: 2500, multipv: 2 });
        if (!r) {
          ok = false;
          break;
        }
        evals[i] = toPositionEval(fen, r.lines);
      }
      chess.analysing[id] = { done: evals.filter(Boolean).length, total };
      if (i % 4 === 3 || i === fens.length - 1) {
        const current = gameById(id);
        if (!current) break;
        await saveGame({ ...current, evals: [...evals] });
      }
    }
    const current = gameById(id);
    if (current) await saveGame({ ...current, evals: [...evals] });
  } finally {
    running.delete(id);
    chess.analysing[id] = { done: evals.filter(Boolean).length, total, failed: !ok };
  }
  return ok;
}
