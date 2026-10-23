<script lang="ts">
  // One endgame drill against the engine at full strength.
  import { onDestroy, untrack } from 'svelte';
  import { Chess, type Move, type Square } from 'chess.js';
  import ChessBoard from '../../ui/chess/ChessBoard.svelte';
  import Celebrate from '../../ui/Celebrate.svelte';
  import { playCelebrate } from '../../ui/sound.ts';
  import { legalTargets, playOutcome, type BoardArrow } from '../../core/chess.ts';
  import { endgameById } from '../../core/endgames.ts';
  import { app } from '../../core/state.svelte.ts';
  import { analyse } from '../../ui/chess/stockfish.ts';
  import { think } from '../../ui/chess/engine.ts';
  import { bestMoveFor, chess, recordEndgame } from './chessStore.svelte.ts';
  import { t } from '../../i18n/i18n.ts';

  let { id }: { id: string } = $props();
  const drill = untrack(() => endgameById(id));
  const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  let game = new Chess(drill?.fen);
  let fen = $state(game.fen());
  let history = $state<Move[]>([]);
  let thinking = $state(false);
  let outcome = $state<{ result: 'won' | 'lost'; reason: string } | null>(null);
  let hintArrow = $state<BoardArrow | null>(null);
  let hinting = $state(false);
  let generation = 0;
  let destroyed = false;
  onDestroy(() => (destroyed = true));

  const learner = drill?.learner ?? 'w';
  const learnerMoves = $derived(history.filter((m) => m.color === learner).length);
  const myTurn = $derived(!outcome && !thinking && game.turn() === learner && fen === game.fen());
  const targets = $derived(myTurn ? legalTargets(new Chess(fen)) : new Map<string, string[]>());
  const lastMove = $derived<[string, string] | null>(history.length > 0 ? [history.at(-1)!.from, history.at(-1)!.to] : null);
  const checkSquare = $derived.by(() => {
    const g = new Chess(fen);
    if (!g.inCheck()) return {};
    for (const row of g.board()) for (const sq of row) if (sq && sq.type === 'k' && sq.color === g.turn()) return { [sq.square]: 'bad' as const };
    return {};
  });
  const record = $derived(chess.record.endgames[id]);

  function balance(g: Chess): number {
    let s = 0;
    for (const row of g.board()) for (const sq of row) if (sq) s += (sq.color === learner ? 1 : -1) * (VALUES[sq.type] ?? 0);
    return s;
  }
  const startBalance = untrack(() => balance(game));

  function finish(result: 'won' | 'lost', reason: string) {
    outcome = { result, reason };
    if (result === 'won') {
      void recordEndgame(id, learnerMoves);
      if (app.settings.sounds && app.settings.celebrations) playCelebrate();
    }
  }

  /** Judges the position after a move. Returns true when the drill is over. */
  function judge(last: Move): boolean {
    if (!drill) return true;
    // A promotion only counts once the new piece survives the reply (unless it ends the game).
    if (drill.goal === 'promote' && last.color === learner && last.promotion && !game.isGameOver()) return false;
    if (drill.goal === 'promote' && last.color !== learner) {
      const prev = history.at(-2);
      if (prev?.color === learner && prev.promotion) {
        if (last.to === prev.to) finish('lost', 'promotedLost');
        else finish('won', 'promoted');
        return true;
      }
    }
    if (drill.goal === 'hold' && last.color !== learner) {
      if (last.promotion) {
        finish('lost', 'promotedAgainst');
        return true;
      }
      if (balance(game) <= startBalance - 4) {
        finish('lost', 'lostMaterial');
        return true;
      }
    }
    const result = playOutcome(game, drill.goal, learner, learnerMoves, drill.maxMoves, last);
    if (!result) return false;
    finish(result.result, result.reason);
    return true;
  }

  async function engineTurn() {
    const mine = generation;
    thinking = true;
    const started = Date.now();
    let uci: string | null = null;
    const r = await analyse(game.fen(), { movetime: 600 });
    uci = r?.bestmove ?? (await think(game.fen(), 5, 0)).move;
    const wait = 450 - (Date.now() - started);
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    if (mine !== generation || destroyed) return;
    thinking = false;
    if (!uci) return;
    let move: Move;
    try {
      move = game.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] });
    } catch {
      return;
    }
    fen = game.fen();
    history = game.history({ verbose: true });
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
    history = game.history({ verbose: true });
    if (judge(move)) return;
    void engineTurn();
  }

  function restart() {
    generation += 1;
    game = new Chess(drill?.fen);
    fen = game.fen();
    history = [];
    outcome = null;
    thinking = false;
    hintArrow = null;
    if (game.turn() !== learner) void engineTurn();
  }

  function takeBack() {
    if (thinking || outcome) return;
    let index = history.length - 1;
    while (index >= 0 && history[index]?.color !== learner) index -= 1;
    if (index < 0) return;
    generation += 1;
    while (game.history().length > index) game.undo();
    fen = game.fen();
    history = game.history({ verbose: true });
    hintArrow = null;
  }

  async function hint() {
    if (!myTurn || hinting) return;
    hinting = true;
    const mine = generation;
    const uci = await bestMoveFor(game.fen());
    hinting = false;
    if (mine !== generation || !uci || destroyed) return;
    hintArrow = { from: uci.slice(0, 2), to: uci.slice(2, 4), tone: 'hint' };
  }

  $effect(() => {
    untrack(() => {
      if (drill && game.turn() !== learner && history.length === 0) void engineTurn();
    });
  });
</script>

{#if !drill}
  <p>{t('endgames.notFound')}</p>
  <p><a class="btn" href="#/play/endgames">{t('play.tab.endgames')}</a></p>
{:else}
  <p><a class="link" href="#/play/endgames">{t('endgames.back')}</a></p>
  <div class="cf-chess cf-chess-play">
    <div class="cf-chess-layout">
      <ChessBoard {fen} orientation={learner} movable={myTurn ? learner : null} {targets} {lastMove} marks={checkSquare} arrows={hintArrow ? [hintArrow] : []} label={t('endgames.name.' + id)} {onmove} />
      <div class="cf-chess-side">
        <h2 class="cf-chess-title">{t('endgames.name.' + id)}</h2>
        <p class="cf-chess-note"><strong>{t('chess.goal')}</strong> {t('endgames.goal.' + drill.goal, { n: drill.maxMoves })}</p>
        <p>{t('endgames.tip.' + id)}</p>
        <p class="cf-chess-status" class:good={outcome?.result === 'won'} class:bad={outcome?.result === 'lost'} role="status">
          <span class="cf-turn" data-color={fen.split(' ')[1]} aria-hidden="true"></span>
          {#if outcome}
            {t('endgames.result.' + outcome.result + '.' + outcome.reason)}
          {:else if thinking}
            {t('chess.thinking')}
          {:else}
            {t('endgames.moveOf', { n: learnerMoves + 1, max: drill.maxMoves })}
          {/if}
        </p>
        {#if outcome?.result === 'won'}
          {#if app.settings.celebrations}<Celebrate message={t('chess.wellPlayed')} />{/if}
          {#if drill.par}<p class="muted">{t('endgames.par', { n: learnerMoves, par: drill.par })}</p>{/if}
        {/if}
        {#if record?.done && !outcome}<p class="muted small">{t('endgames.solved', { n: record.bestMoves ?? 0 })}</p>{/if}
        <div class="cf-chess-controls">
          <button type="button" class="btn" onclick={hint} disabled={!myTurn || hinting}>{hinting ? t('chess.hintThinking') : t('chess.hint')}</button>
          <button type="button" class="btn" onclick={takeBack} disabled={thinking || !!outcome || !history.some((m) => m.color === learner)}>{t('chess.takeBack')}</button>
          <button type="button" class="btn" class:primary={!!outcome} onclick={restart}>{outcome ? t('chess.again') : t('chess.restart')}</button>
        </div>
      </div>
    </div>
  </div>
{/if}
