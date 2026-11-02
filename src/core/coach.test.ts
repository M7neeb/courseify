import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachNotes, type CoachInput } from './coach.ts';
import { estimateRating, gameAccuracy, phaseOf, reviewGame } from './review.ts';
import { START_FEN } from './chess.ts';
import type { PositionEval } from './types.ts';

const base: Omit<CoachInput, 'uci' | 'fenBefore' | 'side' | 'kind'> = { before: null, after: null, plyIndex: 30, recapture: false };
const keys = (input: CoachInput) => coachNotes(input).map((n) => n.key);

test('the coach says what a good move does', () => {
  assert.deepEqual(keys({ ...base, plyIndex: 0, kind: 'best', side: 'w', uci: 'g1f3', fenBefore: START_FEN }), ['develops']);
  assert.deepEqual(keys({ ...base, plyIndex: 0, kind: 'best', side: 'w', uci: 'e2e4', fenBefore: START_FEN }), ['centre']);
  // A knight fork of king and rook names both targets.
  const fork = coachNotes({ ...base, kind: 'best', side: 'w', uci: 'b5c7', fenBefore: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1' });
  assert.deepEqual(fork[0], { key: 'fork', params: { piece: 'knight', a: 'king', b: 'rook' } });
  assert.deepEqual(keys({ ...base, kind: 'best', side: 'w', uci: 'e1g1', fenBefore: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1' }), ['castles']);
  // Taking a loose queen wins it.
  assert.deepEqual(coachNotes({ ...base, kind: 'best', side: 'w', uci: 'd1d8', fenBefore: '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1' })[0], { key: 'winsPiece', params: { piece: 'queen' } });
  assert.deepEqual(keys({ ...base, kind: 'best', side: 'w', uci: 'a7a8q', fenBefore: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1' }), ['promotes']);
  // Nothing to say: a plain line for the class.
  assert.deepEqual(keys({ ...base, kind: 'excellent', side: 'w', uci: 'h2h3', fenBefore: START_FEN }), ['excellentPlain']);
});

test('the coach names what goes wrong and what was better', () => {
  // Rd2?? lets the knight fork king and rook.
  const fen = '4k3/8/8/4n3/8/8/8/3R2K1 w - - 0 1';
  const after: PositionEval = { cp: -500, best: 'e5f3', pv: ['e5f3', 'g1f2', 'f3d2'] };
  assert.deepEqual(coachNotes({ ...base, kind: 'blunder', side: 'w', uci: 'd1d2', fenBefore: fen, before: { cp: 0, best: 'g1f2' }, after })[0], {
    key: 'allowsFork',
    params: { piece: 'knight' }
  });
  // Walking into mate.
  assert.deepEqual(keys({ ...base, kind: 'blunder', side: 'w', uci: 'h2h3', fenBefore: START_FEN, before: { cp: 20 }, after: { mate: -2 } })[0], 'allowsMate');
  // Black missed a mate it had.
  const missed = coachNotes({ ...base, kind: 'miss', side: 'b', uci: 'a7a6', fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', before: { mate: -1 }, after: { cp: 0 } });
  assert.ok(missed.some((n) => n.key === 'missedMate' && n.params?.n === 1));
  // With nothing concrete to name, a plain verdict.
  assert.deepEqual(keys({ ...base, kind: 'inaccuracy', side: 'w', uci: 'h2h3', fenBefore: START_FEN, before: { cp: 40 }, after: { cp: 0 } }), ['slightlyWorse']);
});

test('accuracy punishes blunders harder than a plain average would', () => {
  const graph = [50, 50, 50, 50, 50, 10, 10, 10, 10];
  const moves = [1, 2, 3, 4, 5, 6, 7, 8].map((ply) => ({ ply, color: (ply % 2 ? 'w' : 'b') as 'w' | 'b', accuracy: ply === 5 ? 5 : 100 }));
  const white = gameAccuracy(moves, graph, 'w');
  const plain = (100 * 3 + 5) / 4;
  assert.ok(white < plain, `${white} < ${plain}`);
  assert.equal(gameAccuracy(moves, graph, 'b'), 100);
  assert.equal(gameAccuracy([], graph, 'w'), 0);
});

test('a game rating grows with accuracy and stays in range', () => {
  assert.equal(estimateRating(0), 100);
  assert.equal(estimateRating(100), 3000);
  assert.ok(estimateRating(60) < estimateRating(80));
  assert.equal(estimateRating(80) % 50, 0);
});

test('phases follow the pieces left on the board', () => {
  assert.equal(phaseOf(START_FEN, 0), 'opening');
  assert.equal(phaseOf(START_FEN, 24), 'middlegame');
  assert.equal(phaseOf('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 4), 'endgame');
});

test('a reviewed game carries ratings, phase grades, key moments and notes', () => {
  const moves = ['e2e4', 'e7e5', 'g1f3', 'd7d6', 'f3g5'];
  const evals: PositionEval[] = [
    { cp: 30, best: 'e2e4' },
    { cp: 30, best: 'e7e5' },
    { cp: 30, best: 'g1f3' },
    { cp: 40, best: 'd7d6' },
    { cp: 40, best: 'd2d4', pv: ['d2d4'] },
    { cp: -300, best: 'd8g5', pv: ['d8g5', 'd2d4', 'g5g6'] }
  ];
  const r = reviewGame(START_FEN, moves, evals, true);
  assert.deepEqual(r.keyMoments, [5]);
  assert.ok(r.rating.b > r.rating.w);
  assert.equal(r.phases.opening.b, 'great');
  assert.equal(r.phases.opening.w, 'poor');
  assert.equal(r.phases.endgame.w, null);
  assert.equal(r.moves.at(-1)!.notes[0]?.key, 'hangs');
});
