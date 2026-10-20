// A small chess engine for playing positions out and for the practice board. It is not meant to
// be strong; it is meant to be a fair sparring partner whose strength can be turned down.
//
// 0x88 board, legal move generation (checked by perft against known counts), material plus
// piece-square evaluation, alpha-beta with quiescence search and iterative deepening.
// Pure code: it runs in a Web Worker in the app and directly in Node for tests.

const EMPTY = 0;
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;

const VALUE = [0, 100, 320, 330, 500, 900, 0];

// Piece-square tables from White's point of view, a8 first (index = rank8..rank1, file a..h).
const PST: number[][] = [
  [],
  // pawn
  [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  // knight
  [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  // bishop
  [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  // rook
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  // queen
  [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  // king, middlegame
  [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20]
];
const KING_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];

const KNIGHT_STEPS = [33, 31, 18, 14, -33, -31, -18, -14];
const KING_STEPS = [1, -1, 16, -16, 17, 15, -17, -15];
const BISHOP_DIRS = [17, 15, -17, -15];
const ROOK_DIRS = [1, -1, 16, -16];

const FLAG_EP = 1, FLAG_CASTLE = 2, FLAG_DOUBLE = 4;

function enc(from: number, to: number, promo = 0, flag = 0): number {
  return from | (to << 7) | (promo << 14) | (flag << 17);
}
const mFrom = (m: number) => m & 127;
const mTo = (m: number) => (m >> 7) & 127;
const mPromo = (m: number) => (m >> 14) & 7;
const mFlag = (m: number) => (m >> 17) & 7;

function sqName(sq: number): string {
  return 'abcdefgh'[sq & 7]! + String((sq >> 4) + 1);
}
function sqIndex(name: string): number {
  return (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
}
/** 0..63 index into the PST tables (a8 = 0) for a White piece. */
function pstIndex(sq: number, white: boolean): number {
  const file = sq & 7;
  const rank = sq >> 4;
  return white ? (7 - rank) * 8 + file : rank * 8 + file;
}

interface Undo {
  move: number;
  captured: number;
  castling: number;
  ep: number;
  halfmove: number;
}

export class Position {
  board = new Int8Array(128);
  side = 1; // 1 white, -1 black
  castling = 0; // 1 K, 2 Q, 4 k, 8 q
  ep = -1;
  halfmove = 0;
  fullmove = 1;
  kings = [0, 0]; // [white, black]
  private history: Undo[] = [];

  static fromFen(fen: string): Position {
    const p = new Position();
    const [placement = '', side = 'w', castling = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
    let rank = 7;
    let file = 0;
    for (const ch of placement) {
      if (ch === '/') {
        rank -= 1;
        file = 0;
      } else if (/\d/.test(ch)) {
        file += Number(ch);
      } else {
        const type = 'pnbrqk'.indexOf(ch.toLowerCase()) + 1;
        const white = ch === ch.toUpperCase();
        const sq = rank * 16 + file;
        p.board[sq] = white ? type : -type;
        if (type === K) p.kings[white ? 0 : 1] = sq;
        file += 1;
      }
    }
    p.side = side === 'b' ? -1 : 1;
    p.castling = (castling.includes('K') ? 1 : 0) | (castling.includes('Q') ? 2 : 0) | (castling.includes('k') ? 4 : 0) | (castling.includes('q') ? 8 : 0);
    p.ep = ep !== '-' ? sqIndex(ep) : -1;
    p.halfmove = Number(half) || 0;
    p.fullmove = Number(full) || 1;
    return p;
  }

  attacked(sq: number, by: number): boolean {
    const b = this.board;
    // pawns
    const pawnFrom = by === 1 ? [sq - 15, sq - 17] : [sq + 15, sq + 17];
    for (const s of pawnFrom) if (!(s & 0x88) && b[s] === P * by) return true;
    for (const d of KNIGHT_STEPS) {
      const s = sq + d;
      if (!(s & 0x88) && b[s] === N * by) return true;
    }
    for (const d of KING_STEPS) {
      const s = sq + d;
      if (!(s & 0x88) && b[s] === K * by) return true;
    }
    for (const d of BISHOP_DIRS) {
      for (let s = sq + d; !(s & 0x88); s += d) {
        const v = b[s] as number;
        if (v !== EMPTY) {
          if (v === B * by || v === Q * by) return true;
          break;
        }
      }
    }
    for (const d of ROOK_DIRS) {
      for (let s = sq + d; !(s & 0x88); s += d) {
        const v = b[s] as number;
        if (v !== EMPTY) {
          if (v === R * by || v === Q * by) return true;
          break;
        }
      }
    }
    return false;
  }

  inCheck(side = this.side): boolean {
    return this.attacked(this.kings[side === 1 ? 0 : 1] as number, -side);
  }

  /** Pseudo-legal moves; `capturesOnly` for quiescence search. */
  pseudoMoves(capturesOnly = false): number[] {
    const out: number[] = [];
    const b = this.board;
    const us = this.side;
    for (let sq = 0; sq < 128; sq += 1) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const v = b[sq] as number;
      if (v === EMPTY || Math.sign(v) !== us) continue;
      const type = Math.abs(v);
      if (type === P) {
        const dir = us === 1 ? 16 : -16;
        const startRank = us === 1 ? 1 : 6;
        const promoRank = us === 1 ? 7 : 0;
        const one = sq + dir;
        if (!(one & 0x88) && b[one] === EMPTY) {
          if (one >> 4 === promoRank) for (const pr of [Q, N, R, B]) out.push(enc(sq, one, pr));
          else if (!capturesOnly) {
            out.push(enc(sq, one));
            const two = one + dir;
            if (sq >> 4 === startRank && b[two] === EMPTY) out.push(enc(sq, two, 0, FLAG_DOUBLE));
          }
        }
        for (const side of [dir - 1, dir + 1]) {
          const t = sq + side;
          if (t & 0x88) continue;
          const target = b[t] as number;
          if (target !== EMPTY && Math.sign(target) === -us) {
            if (t >> 4 === promoRank) for (const pr of [Q, N, R, B]) out.push(enc(sq, t, pr));
            else out.push(enc(sq, t));
          } else if (t === this.ep) out.push(enc(sq, t, 0, FLAG_EP));
        }
      } else if (type === N || type === K) {
        for (const d of type === N ? KNIGHT_STEPS : KING_STEPS) {
          const t = sq + d;
          if (t & 0x88) continue;
          const target = b[t] as number;
          if (target === EMPTY) {
            if (!capturesOnly) out.push(enc(sq, t));
          } else if (Math.sign(target) === -us) out.push(enc(sq, t));
        }
        if (type === K && !capturesOnly) this.castles(sq, out);
      } else {
        const dirs = type === B ? BISHOP_DIRS : type === R ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
        for (const d of dirs) {
          for (let t = sq + d; !(t & 0x88); t += d) {
            const target = b[t] as number;
            if (target === EMPTY) {
              if (!capturesOnly) out.push(enc(sq, t));
            } else {
              if (Math.sign(target) === -us) out.push(enc(sq, t));
              break;
            }
          }
        }
      }
    }
    return out;
  }

  private castles(sq: number, out: number[]): void {
    const b = this.board;
    const us = this.side;
    const home = us === 1 ? 4 : 0x74;
    if (sq !== home || this.attacked(sq, -us)) return;
    const kingSide = us === 1 ? 1 : 4;
    const queenSide = us === 1 ? 2 : 8;
    if (this.castling & kingSide && b[sq + 1] === EMPTY && b[sq + 2] === EMPTY && b[sq + 3] === R * us && !this.attacked(sq + 1, -us) && !this.attacked(sq + 2, -us)) {
      out.push(enc(sq, sq + 2, 0, FLAG_CASTLE));
    }
    if (this.castling & queenSide && b[sq - 1] === EMPTY && b[sq - 2] === EMPTY && b[sq - 3] === EMPTY && b[sq - 4] === R * us && !this.attacked(sq - 1, -us) && !this.attacked(sq - 2, -us)) {
      out.push(enc(sq, sq - 2, 0, FLAG_CASTLE));
    }
  }

  /** Makes a move; returns false (and takes it back) when it leaves the own king in check. */
  make(m: number): boolean {
    const b = this.board;
    const from = mFrom(m);
    const to = mTo(m);
    const flag = mFlag(m);
    const piece = b[from] as number;
    const us = this.side;
    const undo: Undo = { move: m, captured: b[to] as number, castling: this.castling, ep: this.ep, halfmove: this.halfmove };
    if (flag & FLAG_EP) {
      const capSq = to - (us === 1 ? 16 : -16);
      undo.captured = b[capSq] as number;
      b[capSq] = EMPTY;
    }
    b[to] = mPromo(m) ? mPromo(m) * us : piece;
    b[from] = EMPTY;
    if (flag & FLAG_CASTLE) {
      if (to > from) {
        b[from + 1] = b[from + 3] as number;
        b[from + 3] = EMPTY;
      } else {
        b[from - 1] = b[from - 4] as number;
        b[from - 4] = EMPTY;
      }
    }
    if (Math.abs(piece) === K) this.kings[us === 1 ? 0 : 1] = to;
    // Castling rights go when a king or rook moves or a rook is captured.
    for (const sq of [from, to]) {
      if (sq === 4) this.castling &= ~3;
      if (sq === 0x74) this.castling &= ~12;
      if (sq === 7) this.castling &= ~1;
      if (sq === 0) this.castling &= ~2;
      if (sq === 0x77) this.castling &= ~4;
      if (sq === 0x70) this.castling &= ~8;
    }
    this.ep = flag & FLAG_DOUBLE ? from + (us === 1 ? 16 : -16) : -1;
    this.halfmove = Math.abs(piece) === P || undo.captured !== EMPTY ? 0 : this.halfmove + 1;
    if (us === -1) this.fullmove += 1;
    this.history.push(undo);
    this.side = -us;
    if (this.inCheck(us)) {
      this.unmake();
      return false;
    }
    return true;
  }

  unmake(): void {
    const undo = this.history.pop();
    if (!undo) return;
    const b = this.board;
    const m = undo.move;
    const from = mFrom(m);
    const to = mTo(m);
    const flag = mFlag(m);
    this.side = -this.side;
    const us = this.side;
    const moved = mPromo(m) ? P * us : (b[to] as number);
    b[from] = moved;
    if (flag & FLAG_EP) {
      b[to] = EMPTY;
      b[to - (us === 1 ? 16 : -16)] = undo.captured;
    } else b[to] = undo.captured;
    if (flag & FLAG_CASTLE) {
      if (to > from) {
        b[from + 3] = b[from + 1] as number;
        b[from + 1] = EMPTY;
      } else {
        b[from - 4] = b[from - 1] as number;
        b[from - 1] = EMPTY;
      }
    }
    if (Math.abs(moved) === K) this.kings[us === 1 ? 0 : 1] = from;
    this.castling = undo.castling;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;
    if (us === -1) this.fullmove -= 1;
  }

  legalMoves(): number[] {
    const out: number[] = [];
    for (const m of this.pseudoMoves()) {
      if (this.make(m)) {
        out.push(m);
        this.unmake();
      }
    }
    return out;
  }

  /** Static evaluation from the side to move's point of view, in centipawns. */
  evaluate(): number {
    const b = this.board;
    let score = 0;
    let material = 0;
    for (let sq = 0; sq < 128; sq += 1) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const v = b[sq] as number;
      if (v !== EMPTY && Math.abs(v) !== K && Math.abs(v) !== P) material += VALUE[Math.abs(v)] as number;
    }
    const endgame = material <= 1600;
    for (let sq = 0; sq < 128; sq += 1) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const v = b[sq] as number;
      if (v === EMPTY) continue;
      const type = Math.abs(v);
      const white = v > 0;
      const table = type === K && endgame ? KING_END : (PST[type] as number[]);
      const s = (VALUE[type] as number) + (table[pstIndex(sq, white)] as number);
      score += white ? s : -s;
    }
    // In an endgame with a big material edge, drive the lone king to the edge and bring ours closer.
    if (endgame && Math.abs(score) > 400) {
      const strong = score > 0 ? 0 : 1;
      const weakKing = this.kings[1 - strong] as number;
      const strongKing = this.kings[strong] as number;
      const centre = Math.abs(3.5 - (weakKing & 7)) + Math.abs(3.5 - (weakKing >> 4));
      const distance = Math.abs((weakKing & 7) - (strongKing & 7)) + Math.abs((weakKing >> 4) - (strongKing >> 4));
      const push = Math.round(centre * 10 + (14 - distance) * 4);
      score += strong === 0 ? push : -push;
    }
    return score * this.side;
  }

  toUci(m: number): string {
    const promo = mPromo(m);
    return sqName(mFrom(m)) + sqName(mTo(m)) + (promo ? ' pnbrqk'[promo] : '');
  }

  fromUci(uci: string): number | undefined {
    return this.legalMoves().find((m) => this.toUci(m) === uci);
  }
}

/** Counts leaf positions to a depth: the standard correctness check for move generators. */
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of pos.pseudoMoves()) {
    if (pos.make(m)) {
      nodes += perft(pos, depth - 1);
      pos.unmake();
    }
  }
  return nodes;
}

const MATE = 100_000;

export interface EngineLevel {
  depth: number;
  /** Time budget for iterative deepening, in ms. */
  timeMs: number;
  /** Random spread added to root move scores, in centipawns: a weaker, more human feel. */
  noise: number;
  /** Chance of simply playing a random legal move. */
  blunder: number;
}

/** Five strengths, from someone who just learnt the moves to the strongest this engine plays. */
export const ENGINE_LEVELS: Record<number, EngineLevel> = {
  1: { depth: 1, timeMs: 300, noise: 300, blunder: 0.3 },
  2: { depth: 2, timeMs: 500, noise: 150, blunder: 0.12 },
  3: { depth: 3, timeMs: 800, noise: 60, blunder: 0.04 },
  4: { depth: 4, timeMs: 1200, noise: 20, blunder: 0 },
  5: { depth: 8, timeMs: 2000, noise: 0, blunder: 0 }
};

class Search {
  nodes = 0;
  stopped = false;
  killers: number[][] = [];
  private pos: Position;
  private deadline: number;
  constructor(pos: Position, deadline: number) {
    this.pos = pos;
    this.deadline = deadline;
  }

  private order(moves: number[], ply: number, first?: number): number[] {
    const b = this.pos.board;
    const killers = this.killers[ply] ?? [];
    const score = (m: number) => {
      if (m === first) return 1_000_000;
      const victim = Math.abs(b[mTo(m)] as number);
      let s = 0;
      if (victim) s += 10_000 + (VALUE[victim] as number) * 10 - (VALUE[Math.abs(b[mFrom(m)] as number)] as number) / 10;
      if (mPromo(m)) s += 9_000;
      if (killers.includes(m)) s += 5_000;
      return s;
    };
    return moves.map((m) => [score(m), m] as const).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
  }

  quiesce(alpha: number, beta: number, ply: number): number {
    this.nodes += 1;
    const stand = this.pos.evaluate();
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    for (const m of this.order(this.pos.pseudoMoves(true), ply)) {
      if (!this.pos.make(m)) continue;
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      this.pos.unmake();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  negamax(depth: number, alpha: number, beta: number, ply: number): number {
    if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) this.stopped = true;
    if (this.stopped) return 0;
    if (this.pos.halfmove >= 100) return 0;
    const inCheck = this.pos.inCheck();
    if (depth <= 0 && !inCheck) return this.quiesce(alpha, beta, ply);
    this.nodes += 1;
    let legal = 0;
    for (const m of this.order(this.pos.pseudoMoves(), ply)) {
      if (!this.pos.make(m)) continue;
      legal += 1;
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      this.pos.unmake();
      if (this.stopped) return 0;
      if (score >= beta) {
        if (!(this.pos.board[mTo(m)] as number)) {
          const k = (this.killers[ply] ??= []);
          if (!k.includes(m)) k.unshift(m), (k.length = Math.min(k.length, 2));
        }
        return beta;
      }
      if (score > alpha) alpha = score;
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;
    return alpha;
  }

  /** Scores for every root move at a depth (from the mover's point of view). */
  root(depth: number, moves: number[], exact: boolean, first?: number): { move: number; score: number }[] {
    const out: { move: number; score: number }[] = [];
    let alpha = -MATE - 1;
    for (const m of this.order(moves, 0, first)) {
      if (!this.pos.make(m)) continue;
      // With noise every root score must be exact, so each move gets a full window; otherwise
      // moves worse than the best so far only need to be proven worse.
      const score = -this.negamax(depth - 1, -MATE - 1, exact ? MATE + 1 : -alpha, 1);
      this.pos.unmake();
      if (this.stopped) break;
      out.push({ move: m, score });
      if (score > alpha) alpha = score;
    }
    return out;
  }
}

export interface EngineResult {
  move: string | null;
  score: number;
  depth: number;
  nodes: number;
}

/**
 * The engine's move for a position at a strength level (1-5). `random` is injectable so tests are
 * repeatable. Mates and the only good move are never thrown away by the noise.
 */
export function bestMove(fen: string, level = 3, random: () => number = Math.random, now: () => number = Date.now): EngineResult {
  const config = ENGINE_LEVELS[level] ?? (ENGINE_LEVELS[3] as EngineLevel);
  const pos = Position.fromFen(fen);
  const moves = pos.legalMoves();
  if (moves.length === 0) return { move: null, score: 0, depth: 0, nodes: 0 };
  if (moves.length === 1) return { move: pos.toUci(moves[0] as number), score: 0, depth: 0, nodes: 0 };
  if (config.blunder > 0 && random() < config.blunder) {
    return { move: pos.toUci(moves[Math.floor(random() * moves.length)] as number), score: 0, depth: 0, nodes: 0 };
  }
  const search = new Search(pos, now() + config.timeMs);
  let best: { move: number; score: number }[] = [];
  let reached = 0;
  for (let depth = 1; depth <= config.depth; depth += 1) {
    const scores = search.root(depth, moves, config.noise > 0, best[0]?.move);
    if (search.stopped && best.length > 0) break;
    if (scores.length === moves.length || best.length === 0) {
      best = scores.sort((a, b) => b.score - a.score);
      reached = depth;
    }
    if (Math.abs(best[0]?.score ?? 0) > MATE - 100) break;
    if (search.stopped) break;
  }
  const top = best[0] as { move: number; score: number };
  let pick = top;
  if (config.noise > 0 && Math.abs(top.score) < MATE - 100) {
    let bestNoisy = -Infinity;
    for (const candidate of best) {
      // Never hang a mate in one, and stay within reach of the best move.
      if (candidate.score < -MATE + 100) continue;
      const noisy = candidate.score + (random() - 0.5) * 2 * config.noise;
      if (noisy > bestNoisy) {
        bestNoisy = noisy;
        pick = candidate;
      }
    }
  }
  return { move: pos.toUci(pick.move), score: pick.score, depth: reached, nodes: search.nodes };
}
