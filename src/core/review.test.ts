import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { classifyMove, formatEval, moveAccuracy, reviewGame, sanLine, terminalEval, whiteWinChance, winChance } from './review.ts';
import { OPENINGS, openingOf } from './openings.ts';
import { BOTS, botSearch, fallbackLevel, pickWeakMove } from './bots.ts';
import { ENDGAMES } from './endgames.ts';
import { START_FEN } from './chess.ts';
import type { PositionEval } from './types.ts';

test('win chance follows the engine score and mates', () => {
  assert.equal(Math.round(whiteWinChance({ cp: 0 })), 50);
  assert.ok(whiteWinChance({ cp: 300 }) > 75);
  assert.ok(whiteWinChance({ cp: -300 }) < 25);
  assert.equal(whiteWinChance({ mate: 3 }), 100);
  assert.equal(whiteWinChance({ mate: -1 }), 0);
  assert.equal(whiteWinChance({ over: 'draw' }), 50);
  assert.equal(winChance({ cp: 300 }, 'b'), 100 - whiteWinChance({ cp: 300 }));
});

test('accuracy is 100 for no loss and falls with bigger losses', () => {
  assert.ok(moveAccuracy(0) > 99.9);
  assert.ok(moveAccuracy(5) > moveAccuracy(20));
  assert.ok(moveAccuracy(80) >= 0);
});

test('evaluations read like a chess site', () => {
  assert.equal(formatEval({ cp: 130 }), '+1.3');
  assert.equal(formatEval({ cp: -40 }), '-0.4');
  assert.equal(formatEval({ mate: 3 }), 'M3');
  assert.equal(formatEval({ mate: -2 }), '-M2');
  assert.equal(formatEval({ over: 'b' }), '0-1');
});

const base = { opponentLoss: 0, book: false, legalMoves: 20, sacrifice: false, recapture: false };

test('moves are judged by the win chance they give away', () => {
  const before: PositionEval = { cp: 30, best: 'e2e4' };
  assert.equal(classifyMove({ ...base, side: 'w', uci: 'e2e4', before, after: { cp: 30 } }).kind, 'best');
  assert.equal(classifyMove({ ...base, side: 'w', uci: 'd2d4', before, after: { cp: 15 } }).kind, 'excellent');
  assert.equal(classifyMove({ ...base, side: 'w', uci: 'g1f3', before, after: { cp: -20 } }).kind, 'good');
  assert.equal(classifyMove({ ...base, side: 'w', uci: 'a2a3', before, after: { cp: -60 } }).kind, 'inaccuracy');
  assert.equal(classifyMove({ ...base, side: 'w', uci: 'f2f3', before, after: { cp: -180 } }).kind, 'mistake');
  assert.equal(classifyMove({ ...base, side: 'w', uci: 'g2g4', before, after: { cp: -600 } }).kind, 'blunder');
  // Black's point of view is mirrored.
  assert.equal(classifyMove({ ...base, side: 'b', uci: 'e7e5', before: { cp: 30, best: 'e7e5' }, after: { cp: 30 } }).kind, 'best');
  assert.equal(classifyMove({ ...base, side: 'b', uci: 'f7f6', before: { cp: 30, best: 'e7e5' }, after: { cp: 700 } }).kind, 'blunder');
});

test('book, only moves, sacrifices and missed chances get their own names', () => {
  const before: PositionEval = { cp: 20, best: 'e2e4', second: { move: 'd2d4', cp: -500 } };
  assert.equal(classifyMove({ ...base, book: true, side: 'w', uci: 'e2e4', before, after: { cp: 20 } }).kind, 'book');
  assert.equal(classifyMove({ ...base, side: 'w', uci: 'e2e4', before, after: { cp: 20 } }).kind, 'great');
  // A recapture is not a great find, even when it is the only move.
  assert.equal(classifyMove({ ...base, recapture: true, side: 'w', uci: 'e2e4', before, after: { cp: 20 } }).kind, 'best');
  assert.equal(classifyMove({ ...base, sacrifice: true, side: 'w', uci: 'e2e4', before: { cp: 150, best: 'e2e4' }, after: { cp: 150 } }).kind, 'brilliant');
  // A sacrifice that loses is no brilliancy.
  assert.equal(classifyMove({ ...base, sacrifice: true, side: 'w', uci: 'h2h4', before: { cp: 150, best: 'e2e4' }, after: { cp: -400 } }).kind, 'blunder');
  assert.equal(classifyMove({ ...base, opponentLoss: 30, side: 'w', uci: 'a2a3', before: { cp: 500, best: 'e2e4' }, after: { cp: 120 } }).kind, 'miss');
  assert.equal(classifyMove({ ...base, legalMoves: 1, side: 'w', uci: 'e1f1', before: { cp: -100, best: 'e1d1' }, after: { cp: -900 } }).kind, 'best');
});

test('a reviewed game counts moves, names the opening and shows the better move', () => {
  // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4? 4. Nxe5 Qg5 5. Nxf7?? Qxg2
  const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'c6d4', 'f3e5', 'd8g5', 'e5f7', 'g5g2'];
  const evals: PositionEval[] = [
    { cp: 30, best: 'e2e4' },
    { cp: 30, best: 'e7e5' },
    { cp: 30, best: 'g1f3' },
    { cp: 30, best: 'b8c6' },
    { cp: 30, best: 'f1c4' },
    { cp: 30, best: 'g8f6' },
    { cp: 150, best: 'f3e5', pv: ['f3e5'] },
    { cp: 140, best: 'd8g5' },
    { cp: 150, best: 'c4f7', second: { move: 'e5f7', cp: -600 } },
    { cp: -800, best: 'g5g2', pv: ['g5g2', 'f7h8', 'g2h1'] },
    { cp: -900, best: 'h1f1' }
  ];
  const r = reviewGame(START_FEN, moves, evals, true);
  assert.equal(r.moves.length, 10);
  assert.equal(r.opening?.en, 'Italian Game');
  assert.deepEqual(r.moves.slice(0, 5).map((m) => m.kind), ['book', 'book', 'book', 'book', 'book']);
  assert.equal(r.moves[5]!.kind, 'mistake');
  assert.equal(r.moves[5]!.best?.san, 'Nf6');
  const blunder = r.moves[8]!;
  assert.equal(blunder.kind, 'blunder');
  assert.equal(blunder.san, 'Nxf7');
  assert.equal(blunder.best?.san, 'Bxf7+');
  assert.equal(r.counts.w.blunder, 1);
  assert.ok(r.accuracy.b > r.accuracy.w);
  assert.equal(r.graph.length, 11);
});

test('a piece left hanging is named in the explanation', () => {
  // 1. e4 e5 2. Nf3 d6 3. Ng5?? Qxg5
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
  const last = r.moves.at(-1)!;
  assert.equal(last.kind, 'blunder');
  assert.deepEqual(last.note, { key: 'hangs', params: { piece: 'knight' } });
});

test('missing verdicts are skipped, not guessed', () => {
  const r = reviewGame(START_FEN, ['e2e4', 'a7a6'], [null, null, null], true);
  assert.equal(r.moves.length, 2);
  assert.equal(r.moves[1]!.kind, 'good');
});

test('finished positions have their own verdict', () => {
  const mate = new Chess();
  for (const m of ['f3', 'e5', 'g4', 'Qh4#']) mate.move(m);
  assert.deepEqual(terminalEval(mate.fen()), { over: 'b' });
  assert.equal(terminalEval(START_FEN), null);
  assert.deepEqual(sanLine(START_FEN, ['e2e4', 'e7e5', 'x9x9']), ['e4', 'e5']);
});

test('every opening line is legal and names the longest match', () => {
  for (const o of OPENINGS) {
    const g = new Chess();
    for (const m of o.moves.split(' ')) assert.doesNotThrow(() => g.move(m), `${o.en}: ${m}`);
    assert.ok(o.de.length > 0);
  }
  assert.equal(openingOf(['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6']).opening?.en, 'Sicilian Defense, Najdorf');
  assert.equal(openingOf(['a2a4']).bookPlies, 0);
  assert.equal(openingOf(['e2e4'], false).bookPlies, 0);
});

test('bots form a ladder and each has a way to play', () => {
  for (let i = 1; i < BOTS.length; i += 1) assert.ok(BOTS[i]!.elo > BOTS[i - 1]!.elo);
  assert.equal(new Set(BOTS.map((b) => b.id)).size, BOTS.length);
  for (const b of BOTS) {
    const s = botSearch(b);
    if (b.elo < 1320) assert.equal(s.kind, 'weak');
    else assert.notEqual(s.kind, 'weak');
    assert.ok(fallbackLevel(b) >= 1 && fallbackLevel(b) <= 5);
  }
});

test('weak bots never miss a mate in one and avoid walking into mate', () => {
  const config = { kind: 'weak' as const, depth: 1, multipv: 5, spread: 500, blunder: 0 };
  const lines = [{ move: 'a2a3', cp: 50 }, { move: 'd1h5', mate: 1 }];
  assert.equal(pickWeakMove(lines, ['a2a3', 'd1h5'], config, () => 0.9), 'd1h5');
  const risky = [{ move: 'g2g4', mate: -1 }, { move: 'e2e4', cp: -900 }];
  for (const r of [0, 0.3, 0.99]) assert.equal(pickWeakMove(risky, ['g2g4', 'e2e4'], config, () => r), 'e2e4');
  // A blunder is a random legal move.
  assert.equal(pickWeakMove(lines.slice(0, 1), ['h2h3'], { ...config, blunder: 1 }, () => 0), 'h2h3');
});

test('endgame drills start from legal positions that are still open', () => {
  for (const d of ENDGAMES) {
    const g = new Chess(d.fen);
    assert.equal(g.isGameOver(), false, d.id);
    assert.ok(d.maxMoves >= (d.par ?? 0), d.id);
  }
});
