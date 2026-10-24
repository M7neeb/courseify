<script lang="ts">
  // Play a position out against the computer: in a lesson ("checkmate with king and rook",
  // "promote the pawn", "hold the draw") or as a free game on the practice board.
  import { onDestroy, untrack } from 'svelte';
  import { Chess, type Move } from 'chess.js';
  import ChessBoard from './ChessBoard.svelte';
  import { think } from './engine.ts';
  import { formatLine, legalTargets, playOutcome, sideToMove, uciOf, type BoardArrow, type Color, type PlayGoal } from '../../core/chess.ts';
  import { playCelebrate } from '../sound.ts';
  import Celebrate from '../Celebrate.svelte';
  import { t } from '../../i18n/i18n.ts';

  let {
    fen: startFen,
    goal = 'free',
    level: startLevel = 3,
    maxMoves,
    learner: learnerColor,
    celebrations = true,
    sounds = false,
    annotate = false,
    onfinish
  }: {
    fen: string;
    goal?: PlayGoal;
    level?: number;
    maxMoves?: number;
    /** The learner's colour; by default the side to move in the position. */
    learner?: Color;
    celebrations?: boolean;
    /** Long-press drawing on touch screens. */
    annotate?: boolean;
    sounds?: boolean;
    onfinish?: (result: 'won' | 'lost' | 'draw') => void;
  } = $props();

  const LEVELS = [1, 2, 3, 4, 5];
  const initial = untrack(() => startFen);
  const learner = $derived<Color>(learnerColor ?? sideToMove(initial));

  let game = new Chess(initial);
  let fen = $state(initial);
  let history = $state<Move[]>([]);
  let thinking = $state(false);
  let outcome = $state<{ result: 'won' | 'lost' | 'draw'; reason: string } | null>(null);
  let hintArrow = $state<BoardArrow | null>(null);
  let hinting = $state(false);
  let level = $state(untrack(() => startLevel));
  // Each restart starts a new generation, so a late engine reply from an old game is ignored.
  let generation = 0;
  let destroyed = false;
  onDestroy(() => (destroyed = true));

  const learnerMoves = $derived(history.filter((m) => m.color === learner).length);
  const lastMove = $derived<[string, string] | null>(history.length > 0 ? [history.at(-1)!.from, history.at(-1)!.to] : null);
  const myTurn = $derived(!outcome && !thinking && sideToMove(fen) === learner);
  const targets = $derived(myTurn ? legalTargets(new Chess(fen)) : new Map<string, string[]>());
  const checkSquare = $derived.by(() => {
    const g = new Chess(fen);
    if (!g.inCheck()) return {};
    const turn = g.turn();
    for (const row of g.board()) for (const sq of row) if (sq && sq.type === 'k' && sq.color === turn) return { [sq.square]: 'bad' as const };
    return {};
  });
  const material = $derived.by(() => {
    const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let score = 0;
    for (const row of new Chess(fen).board()) for (const sq of row) if (sq) score += (sq.color === learner ? 1 : -1) * (values[sq.type] ?? 0);
    return score;
  });
  const movesText = $derived(history.length > 0 ? formatLine(initial, history.map(uciOf)) : '');

  function judge(last: Move | null) {
    const result = playOutcome(game, goal, learner, learnerMoves, maxMoves, last);
    if (!result) return false;
    // In a free game a draw is a draw, not a loss.
    const isDraw = goal === 'free' && result.result === 'lost' && result.reason !== 'mated';
    outcome = isDraw ? { result: 'draw', reason: result.reason } : result;
    if (outcome.result === 'won' && sounds && celebrations) playCelebrate();
    onfinish?.(outcome.result);
    return true;
  }

  async function engineTurn() {
    const mine = generation;
    thinking = true;
    const result = await think(game.fen(), level);
    if (mine !== generation || destroyed) return;
    thinking = false;
    if (!result.move) return;
    const move = game.move({ from: result.move.slice(0, 2), to: result.move.slice(2, 4), promotion: result.move[4] });
    fen = game.fen();
    history = [...history, move];
    judge(move);
  }

  function onmove(from: string, to: string, promotion?: string) {
    if (!myTurn) return;
    let move: Move;
    try {
      move = game.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      return;
    }
    hintArrow = null;
    fen = game.fen();
    history = [...history, move];
    if (judge(move)) return;
    void engineTurn();
  }

  function restart() {
    generation += 1;
    game = new Chess(initial);
    fen = initial;
    history = [];
    outcome = null;
    thinking = false;
    hintArrow = null;
    startIfComputerMoves();
  }

  function takeBack() {
    if (thinking) return;
    // Take back the learner's last move and the computer's answer to it.
    let index = history.length - 1;
    while (index >= 0 && history[index]?.color !== learner) index -= 1;
    if (index < 0) return;
    generation += 1;
    while (game.history().length > index) game.undo();
    history = game.history({ verbose: true });
    fen = game.fen();
    outcome = null;
    hintArrow = null;
  }

  async function hint() {
    if (!myTurn || hinting) return;
    hinting = true;
    const mine = generation;
    const result = await think(game.fen(), 5, 0);
    hinting = false;
    if (mine !== generation || !result.move) return;
    hintArrow = { from: result.move.slice(0, 2), to: result.move.slice(2, 4), tone: 'hint' };
  }

  function startIfComputerMoves() {
    if (sideToMove(game.fen()) !== learner && !game.isGameOver()) void engineTurn();
  }
  $effect(() => {
    untrack(() => startIfComputerMoves());
  });

  const goalText = $derived(
    goal === 'mate'
      ? maxMoves
        ? t('chess.goal.mateIn', { n: maxMoves })
        : t('chess.goal.mate')
      : goal === 'promote'
        ? t('chess.goal.promote')
        : goal === 'hold'
          ? t('chess.goal.hold', { n: maxMoves ?? 20 })
          : ''
  );
</script>

<div class="cf-chess cf-chess-play">
  <div class="cf-chess-layout">
    <ChessBoard
      {fen}
      orientation={learner}
      movable={myTurn ? learner : null}
      {targets}
      {lastMove}
      marks={checkSquare}
      arrows={hintArrow ? [hintArrow] : []}
      label={t('chess.playBoard')}
      {annotate}
      {onmove}
    />
    <div class="cf-chess-side">
      {#if goalText}<p class="cf-chess-note"><strong>{t('chess.goal')}</strong> {goalText}</p>{/if}
      <p class="cf-chess-status" class:good={outcome?.result === 'won'} class:bad={outcome?.result === 'lost'} role="status">
        <span class="cf-turn" data-color={sideToMove(fen)} aria-hidden="true"></span>
        {#if outcome}
          {t('chess.result.' + outcome.result + '.' + outcome.reason)}
        {:else if thinking}
          {t('chess.thinking')}
        {:else}
          {t('chess.yourMove')}
        {/if}
      </p>
      {#if outcome?.result === 'won' && celebrations}<Celebrate message={t('chess.wellPlayed')} />{/if}
      <p class="cf-chess-moves">
        {#if movesText}{movesText}{:else}{t('chess.noMovesYet')}{/if}
      </p>
      <p class="cf-small cf-muted cf-eval">{material === 0 ? t('chess.materialEven') : t(material > 0 ? 'chess.materialUp' : 'chess.materialDown', { n: Math.abs(material) })}</p>

      <div class="cf-chess-controls">
        <button type="button" class="btn" onclick={hint} disabled={!myTurn || hinting}>{hinting ? t('chess.hintThinking') : t('chess.hint')}</button>
        <button type="button" class="btn" onclick={takeBack} disabled={thinking || !history.some((m) => m.color === learner)}>{t('chess.takeBack')}</button>
        <button type="button" class="btn" onclick={restart}>{outcome ? t('chess.again') : t('chess.restart')}</button>
      </div>

      <div>
        <p class="cf-small cf-muted" id="cf-level-label">{t('chess.level')}</p>
        <div class="cf-level-pick" role="group" aria-labelledby="cf-level-label">
          {#each LEVELS as l (l)}
            <button type="button" aria-pressed={level === l} title={t('chess.levelHint.' + l)} onclick={() => (level = l)}>{t('chess.levelName.' + l)}</button>
          {/each}
        </div>
        <p class="cf-small cf-muted">{t('chess.levelHint.' + level)}</p>
      </div>
    </div>
  </div>
</div>
