import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess, type Square } from 'chess.js';
import { BOTS, BOT_STYLES, bookMove, botById, botSearch, customBot, pickStyledMove, styleBonus, weakSearch } from './bots.ts';
import { TIME_CONTROLS, botThinkTime, canMate, capturedPieces, formatClock, ratingChange, timeCategory, timeLabel } from './clock.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('every bot has a known style, and every opening it knows is legal', () => {
  assert.ok(BOTS.length >= 25);
  for (const bot of BOTS) {
    assert.ok(BOT_STYLES.includes(bot.style), bot.id);
    for (const line of bot.book ?? []) {
      const g = new Chess();
      for (const m of line.split(' ')) {
        assert.doesNotThrow(() => g.move({ from: m.slice(0, 2) as Square, to: m.slice(2, 4) as Square, promotion: m[4] }), `${bot.id}: ${line} (${m})`);
      }
    }
  }
});

test('a bot plays its opening from memory while the game follows it', () => {
  const zara = botById('zara')!;
  assert.equal(bookMove(zara, ['e2e4', 'e7e5'], () => 0), 'f2f4');
  assert.equal(bookMove(zara, ['g1f3'], () => 0), null);
  assert.equal(bookMove(botById('max')!, [], () => 0), null);
});

test('weak strengths in between are mixed from their neighbours, the fixed points stay', () => {
  assert.deepEqual(weakSearch(250), { kind: 'weak', depth: 1, multipv: 12, spread: 500, blunder: 0.3 });
  assert.deepEqual(weakSearch(1200), { kind: 'weak', depth: 6, multipv: 4, spread: 50, blunder: 0.02 });
  const mid = weakSearch(700);
  assert.ok(mid.spread < 200 && mid.spread > 130 && mid.blunder < 0.11 && mid.blunder > 0.07);
  assert.equal(botSearch(botById('atlas')!).kind, 'full');
  assert.equal(botSearch(botById('mateo')!).kind, 'weak');
});

test('a custom bot can be any strength from 100 to 3200, in steps of 50', () => {
  assert.equal(customBot(1437).elo, 1450);
  assert.equal(customBot(5).elo, 100);
  assert.equal(customBot(9999).elo, 3200);
  const b = botById('custom-1450')!;
  assert.equal(b.custom, true);
  assert.equal(b.name, 'Bot 1450');
  assert.equal(botSearch(b).kind, 'elo');
  assert.equal(botById('custom-300')!.elo, 300);
});

test('styles prefer their kind of move', () => {
  // White can take on e5 (Nxe5) or play quiet d3.
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  assert.ok(styleBonus(fen, 'f3e5', 'aggressive', 4) > styleBonus(fen, 'd2d3', 'aggressive', 4));
  assert.ok(styleBonus(fen, 'd2d3', 'pawns', 4) > styleBonus(fen, 'f1c4', 'pawns', 4));
  assert.ok(styleBonus(fen, 'd1e2', 'queen', 4) > 0);
  assert.equal(styleBonus(fen, 'f3e5', 'balanced', 4), 0);
  // A strong bot only switches to a styled move that is nearly as good.
  const lines = [{ move: 'f1c4', cp: 40 }, { move: 'f3e5', cp: 30 }, { move: 'h2h4', cp: -60 }];
  assert.equal(pickStyledMove('f1c4', lines, 1600, (m) => styleBonus(fen, m, 'aggressive', 4)), 'f3e5');
  assert.equal(pickStyledMove('f1c4', lines, 1600, (m) => (m === 'h2h4' ? 999 : 0)), 'f1c4');
});

test('clock faces, time controls and the bot\'s thinking budget', () => {
  assert.equal(formatClock(600_000), '10:00');
  assert.equal(formatClock(65_400), '1:06');
  assert.equal(formatClock(3_725_000), '1:02:05');
  assert.equal(formatClock(9_420), '0:09.4');
  assert.equal(formatClock(-50), '0:00.0');
  assert.equal(timeLabel({ base: 180, inc: 2 }), '3 | 2');
  assert.equal(timeLabel({ base: 600, inc: 0 }), '10 min');
  assert.equal(timeCategory({ base: 60, inc: 0 }), 'bullet');
  assert.equal(timeCategory({ base: 180, inc: 2 }), 'blitz');
  assert.equal(timeCategory({ base: 600, inc: 0 }), 'rapid');
  assert.equal(TIME_CONTROLS[0], null);
  assert.equal(botThinkTime(600_000, 0, 1500), 1500);
  assert.ok(botThinkTime(5_000, 0, 1500) < 200);
});

test('running out of time against a lone king or a single minor piece is a draw', () => {
  assert.equal(canMate('8/8/8/4k3/8/8/8/4K3 w - - 0 1', 'w'), false);
  assert.equal(canMate('8/8/8/4k3/8/8/8/3NK3 w - - 0 1', 'w'), false);
  assert.equal(canMate('8/8/8/4k3/8/8/8/2BNK3 w - - 0 1', 'w'), true);
  assert.equal(canMate('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1', 'w'), true);
  assert.equal(canMate(START, 'b'), true);
});

test('captured pieces and the material balance', () => {
  const none = capturedPieces(START);
  assert.deepEqual(none, { w: [], b: [], diff: 0 });
  // White is a knight up: Black lost a knight and a pawn, White lost a pawn.
  const g = new Chess();
  for (const m of ['e4', 'd5', 'exd5', 'Nf6', 'Nc3', 'Nxd5', 'Nxd5', 'Qxd5']) g.move(m);
  const c = capturedPieces(g.fen());
  assert.deepEqual(c.w, ['n', 'p']);
  assert.deepEqual(c.b, ['n', 'p']);
  assert.equal(c.diff, 0);
  const up = capturedPieces('rnbqkb1r/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.deepEqual(up.b, ['n']);
  assert.equal(up.diff, 3);
});

test('rating moves toward the result, faster in the first games', () => {
  assert.equal(ratingChange(800, 800, 1, 20), 10);
  assert.equal(ratingChange(800, 800, 0, 20), -10);
  assert.equal(ratingChange(800, 800, 0.5, 20), 0);
  assert.ok(ratingChange(800, 1600, 1, 20) > 18);
  assert.ok(ratingChange(800, 800, 1, 0) === 20);
});
