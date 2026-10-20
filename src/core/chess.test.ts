import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { chessBlockErrors, chessQuestionErrors, formatLine, gradeChess, judgeMove, playOutcome, readLine, START_FEN } from './chess.ts';
import { Position, bestMove, perft } from './chessEngine.ts';
import { gradeAnswer } from './grade.ts';
import { validateCourse } from './validate.ts';
import type { Question } from './types.ts';

// A smothered mate: 1. Qg8+ Rxg8 2. Nf7#.
const smothered: Question = {
  id: 'p1',
  kind: 'chess',
  prompt: 'White to move and mate in 2.',
  fen: '5r1k/6pp/7N/3Q4/8/8/8/6K1 w - - 0 1',
  solution: ['Qg8+', 'Rxg8', 'Nf7#']
};

test('the engine move generator matches the standard perft counts', () => {
  assert.equal(perft(Position.fromFen(START_FEN), 3), 8902);
  // "Kiwipete": castling, en passant, promotions and pins.
  assert.equal(perft(Position.fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), 3), 97862);
  // Position 3: en passant discovered checks along a rank.
  assert.equal(perft(Position.fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 4), 43238);
  // Position 4: promotions and castling under attack.
  assert.equal(perft(Position.fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), 3), 9467);
});

test('the engine finds mates and wins material, and every level plays legal moves', () => {
  // Mate in one: Ra8#.
  assert.equal(bestMove('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 4).move, 'a1a8');
  // A hanging queen is taken.
  assert.equal(bestMove('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', 3).move, 'd2d5');
  // The smothered mate in two at the strongest level.
  assert.equal(bestMove(smothered.fen!, 5).move, 'd5g8');
  let seed = 1;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const level of [1, 2, 3, 4, 5]) {
    const { move } = bestMove(START_FEN, level, random);
    assert.ok(move && new Chess().moves({ verbose: true }).some((m) => m.lan === move), `level ${level} played ${move}`);
  }
  assert.equal(bestMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').move, null);
});

test('lines read in SAN or UCI and format with move numbers', () => {
  const read = readLine(START_FEN, ['e4', 'e7e5', 'Nf3']);
  assert.ok('line' in read && read.line.uci.join(' ') === 'e2e4 e7e5 g1f3');
  assert.ok('line' in readLine(START_FEN, ['e4!', 'e5?!']));
  assert.ok('error' in readLine(START_FEN, ['e5']));
  assert.equal(formatLine(START_FEN, ['e4', 'e5', 'Nf3']), '1. e4 e5 2. Nf3');
  assert.equal(formatLine('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 3 3', ['Nf6', 'Nc3']), '3... Nf6 4. Nc3');
});

test('a puzzle accepts its line and any mate, and nothing else', () => {
  assert.deepEqual(judgeMove(smothered, [], 'd5g8'), { kind: 'continue', reply: 'f8g8' });
  const reply = 'f8g8';
  assert.equal(judgeMove(smothered, [], 'h6f7').kind, 'wrong');
  assert.equal(judgeMove(smothered, ['d5g8', reply], 'h6f7').kind, 'solved');
  assert.equal(gradeChess(smothered, ['d5g8', reply, 'h6f7']), true);
  assert.equal(gradeAnswer(smothered, ['d5g8', reply, 'h6f7']), true);
  assert.equal(gradeChess(smothered, ['d5g8', reply]), false);
  assert.equal(gradeChess(smothered, ['h6f7']), false);
  // Mate in one where the line names another mate: any mate counts.
  const mateIn1: Question = { id: 'm', kind: 'chess', prompt: '?', fen: '6k1/5ppp/8/8/8/8/8/R3R1K1 w - - 0 1', solution: ['Ra8#'] };
  assert.equal(gradeChess(mateIn1, ['e1e8']), true);
});

test('broken chess data is reported in plain words', () => {
  assert.deepEqual(chessQuestionErrors({ fen: smothered.fen, solution: smothered.solution }), []);
  assert.match(chessQuestionErrors({ fen: 'nonsense', solution: ['e4'] })[0]!, /fen/);
  assert.match(chessQuestionErrors({ fen: START_FEN, solution: ['e5'] })[0]!, /solution\[0\]/);
  assert.match(chessQuestionErrors({ fen: START_FEN, solution: ['e4', 'e5'] })[0]!, /odd/);
  assert.deepEqual(chessBlockErrors({ mode: 'show', steps: [{ move: 'e4', note: 'centre' }, { move: 'e5', arrows: ['g1f3'] }] }), []);
  assert.match(chessBlockErrors({ mode: 'show', steps: [{ move: 'Nf4' }] })[0]!, /steps\[0\]/);
  assert.match(chessBlockErrors({ mode: 'play', fen: START_FEN, goal: 'win' })[0]!, /goal/);
  const course = {
    schemaVersion: 2,
    id: 'c',
    title: 'Chess',
    modules: [
      {
        id: 'm',
        title: 'M',
        lessons: [
          {
            id: 'l',
            title: 'L',
            blocks: [
              { id: 'q', type: 'quiz', questions: [smothered] },
              { id: 'b', type: 'chess', mode: 'play', fen: '8/8/8/8/8/8/k7/4K2Q w - - 0 1', goal: 'mate' }
            ]
          }
        ]
      }
    ]
  };
  const result = validateCourse(course);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('a play-out knows when the goal is reached', () => {
  const mated = new Chess('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
  const move = mated.move('Qg7#');
  assert.deepEqual(playOutcome(mated, 'mate', 'w', 1, undefined, move), { result: 'won', reason: 'mate' });
  const stalemate = new Chess('7k/8/6K1/8/8/8/8/5Q2 w - - 0 1');
  const stale = stalemate.move('Qf7');
  assert.deepEqual(playOutcome(stalemate, 'mate', 'w', 1, undefined, stale), { result: 'lost', reason: 'stalemate' });
  const promo = new Chess('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
  assert.deepEqual(playOutcome(promo, 'promote', 'w', 1, undefined, promo.move('e8=Q')), { result: 'won', reason: 'promoted' });
  const hold = new Chess('8/8/8/8/8/8/k7/4K3 w - - 0 1');
  assert.equal(playOutcome(hold, 'hold', 'w', 20, 20, null)?.result, 'won');
});
