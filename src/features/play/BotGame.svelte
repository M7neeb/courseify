<script lang="ts">
  // A game against a bot. Every move is saved, so a game can be left and continued later.
  import { onDestroy, untrack } from 'svelte';
  import { Chess, type Move, type Square } from 'chess.js';
  import ChessBoard from '../../ui/chess/ChessBoard.svelte';
  import BotAvatar from '../../ui/chess/BotAvatar.svelte';
  import Celebrate from '../../ui/Celebrate.svelte';
  import { playCelebrate } from '../../ui/sound.ts';
  import { legalTargets, type BoardArrow } from '../../core/chess.ts';
  import { botById } from '../../core/bots.ts';
  import { app, navigate } from '../../core/state.svelte.ts';
  import type { SavedGame } from '../../core/types.ts';
  import { bestMoveFor, botMove, gameById, newGameId, saveGame } from './chessStore.svelte.ts';
  import { newGame as engineNewGame } from '../../ui/chess/stockfish.ts';
  import { t } from '../../i18n/i18n.ts';

  let { id }: { id: string } = $props();

  const saved = untrack(() => gameById(id));
  const bot = saved ? botById(saved.botId) : undefined;

  let record = $state<SavedGame | undefined>(saved ? { ...saved } : undefined);
  let game = new Chess(saved?.startFen);
  for (const m of saved?.moves ?? []) {
    try {
      game.move({ from: m.slice(0, 2) as Square, to: m.slice(2, 4) as Square, promotion: m[4] });
    } catch {
      break;
    }
  }
  let fen = $state(game.fen());
  let history = $state<Move[]>(game.history({ verbose: true }));
  let thinking = $state(false);
  let hintArrow = $state<BoardArrow | null>(null);
  let hinting = $state(false);
  let confirmResign = $state(false);
  let generation = 0;
  let destroyed = false;
  onDestroy(() => (destroyed = true));

  const learner = saved?.color ?? 'w';
  const finished = $derived(Boolean(record?.result));
  const myTurn = $derived(!finished && !thinking && game.turn() === learner && fen === game.fen());
  const targets = $derived(myTurn ? legalTargets(new Chess(fen)) : new Map<string, string[]>());
  const lastMove = $derived<[string, string] | null>(history.length > 0 ? [history.at(-1)!.from, history.at(-1)!.to] : null);
  const checkSquare = $derived.by(() => {
    const g = new Chess(fen);
    if (!g.inCheck()) return {};
    for (const row of g.board()) for (const sq of row) if (sq && sq.type === 'k' && sq.color === g.turn()) return { [sq.square]: 'bad' as const };
    return {};
  });
  const material = $derived.by(() => {
    const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let score = 0;
    for (const row of new Chess(fen).board()) for (const sq of row) if (sq) score += (sq.color === learner ? 1 : -1) * (values[sq.type] ?? 0);
    return score;
  });
  /** Moves as "1. e4 e5" pairs for the score sheet. */
  const rows = $derived.by(() => {
    const out: { n: number; w?: string; b?: string }[] = [];
    const startBlack = (record?.startFen.split(' ')[1] ?? 'w') === 'b';
    history.forEach((m, i) => {
      const ply = i + (startBlack ? 1 : 0);
      const n = Math.floor(ply / 2) + 1;
      if (m.color === 'w') out.push({ n, w: m.san });
      else if (out.length > 0 && out.at(-1)!.n === n && !out.at(-1)!.b) out.at(-1)!.b = m.san;
      else out.push({ n, b: m.san });
    });
    return out;
  });
  const profileName = $derived(app.settings.profileName?.trim() || t('bots.you'));

  async function persist(patch: Partial<SavedGame> = {}) {
    if (!record) return;
    record = { ...record, ...patch, moves: history.map((m) => m.from + m.to + (m.promotion ?? '')) };
    await saveGame(record);
  }

  /** Ends the game when the position says so. Returns true when it is over. */
  function judge(): boolean {
    if (!record || record.result) return true;
    let result: SavedGame['result'];
    let reason = '';
    if (game.isCheckmate()) {
      result = game.turn() === learner ? 'lost' : 'won';
      reason = 'mate';
    } else if (game.isStalemate()) [result, reason] = ['draw', 'stalemate'];
    else if (game.isInsufficientMaterial()) [result, reason] = ['draw', 'material'];
    else if (game.isThreefoldRepetition()) [result, reason] = ['draw', 'repetition'];
    else if (game.isDraw()) [result, reason] = ['draw', 'fifty'];
    if (!result) return false;
    void persist({ result, reason, finishedAt: new Date().toISOString() });
    if (result === 'won' && app.settings.sounds && app.settings.celebrations) playCelebrate();
    return true;
  }

  async function botTurn() {
    if (!record || !bot) return;
    const mine = generation;
    thinking = true;
    const uci = await botMove(game.fen(), bot.id);
    if (mine !== generation || destroyed) return;
    thinking = false;
    if (!uci) return;
    try {
      game.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] });
    } catch {
      return;
    }
    fen = game.fen();
    history = game.history({ verbose: true });
    if (!judge()) void persist();
  }

  function onmove(from: string, to: string, promotion?: string) {
    if (!myTurn) return;
    try {
      game.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      return;
    }
    hintArrow = null;
    confirmResign = false;
    fen = game.fen();
    history = game.history({ verbose: true });
    if (judge()) return;
    void persist();
    void botTurn();
  }

  function takeBack() {
    if (thinking || !record?.assist || finished) return;
    let index = history.length - 1;
    while (index >= 0 && history[index]?.color !== learner) index -= 1;
    if (index < 0) return;
    generation += 1;
    while (game.history().length > index) game.undo();
    fen = game.fen();
    history = game.history({ verbose: true });
    hintArrow = null;
    void persist({ assisted: true });
  }

  async function hint() {
    if (!myTurn || hinting || !record?.assist) return;
    hinting = true;
    const mine = generation;
    const uci = await bestMoveFor(game.fen());
    hinting = false;
    if (mine !== generation || !uci || destroyed) return;
    hintArrow = { from: uci.slice(0, 2), to: uci.slice(2, 4), tone: 'hint' };
    void persist({ assisted: true });
  }

  function resign() {
    if (!confirmResign) {
      confirmResign = true;
      return;
    }
    generation += 1;
    thinking = false;
    confirmResign = false;
    void persist({ result: 'lost', reason: 'resign', finishedAt: new Date().toISOString() });
  }

  async function rematch() {
    if (!record) return;
    const next = newGameId();
    engineNewGame();
    await saveGame({ id: next, botId: record.botId, color: record.color, startFen: record.startFen, moves: [], startedAt: new Date().toISOString(), assist: record.assist });
    navigate({ name: 'play', view: 'game', id: next });
  }

  // The bot moves first when the learner plays Black, or when a saved game stopped on its turn.
  $effect(() => {
    untrack(() => {
      if (record && !record.result && game.turn() !== learner && !game.isGameOver()) void botTurn();
    });
  });
</script>

{#if !record || !bot}
  <p>{t('bots.notFound')}</p>
  <p><a class="btn" href="#/play">{t('bots.choose')}</a></p>
{:else}
  <div class="cf-game">
    <div class="cf-game-board">
      <div class="cf-player-bar">
        <BotAvatar {bot} size={32} />
        <span class="cf-player-name">{bot.name} <span class="muted">({bot.elo})</span></span>
        {#if thinking}<span class="cf-thinking" role="status">{t('bots.thinking')}</span>{/if}
        {#if material < 0}<span class="cf-material">+{-material}</span>{/if}
      </div>
      <ChessBoard
        {fen}
        orientation={learner}
        movable={myTurn ? learner : null}
        {targets}
        {lastMove}
        marks={checkSquare}
        arrows={hintArrow ? [hintArrow] : []}
        label={t('bots.boardLabel', { name: bot.name })}
        {onmove}
      />
      <div class="cf-player-bar">
        <span class="cf-you-dot" data-color={learner} aria-hidden="true"></span>
        <span class="cf-player-name">{profileName}</span>
        {#if material > 0}<span class="cf-material">+{material}</span>{/if}
      </div>
    </div>

    <div class="cf-game-side">
      {#if record.result}
        <div class="cf-game-over" class:won={record.result === 'won'} class:lost={record.result === 'lost'} role="status">
          <p class="cf-game-over-title">{t('bots.end.' + record.result)}</p>
          <p>{t('bots.reason.' + (record.reason ?? 'mate') + '.' + record.result, { name: bot.name })}</p>
          {#if record.result === 'won' && app.settings.celebrations}<Celebrate message={t('chess.wellPlayed')} />{/if}
          <div class="cf-chess-controls">
            <a class="btn primary" href={'#/play/review/' + encodeURIComponent(record.id)}>{t('bots.review')}</a>
            <button type="button" class="btn" onclick={rematch}>{t('bots.rematch')}</button>
            <a class="btn" href="#/play">{t('bots.newBot')}</a>
          </div>
        </div>
      {:else}
        <p class="cf-bot-says">{history.length < 2 ? t('bots.hello.' + bot.id) : myTurn ? t('chess.yourMove') : t('bots.thinking')}</p>
      {/if}

      <ol class="cf-score-sheet" aria-label={t('bots.moves')}>
        {#each rows as row, i (i)}
          <li><span class="n">{row.n}.</span><span>{row.w ?? '…'}</span><span>{row.b ?? ''}</span></li>
        {:else}
          <li class="muted">{t('chess.noMovesYet')}</li>
        {/each}
      </ol>

      {#if !record.result}
        <div class="cf-chess-controls">
          {#if record.assist}
            <button type="button" class="btn" onclick={hint} disabled={!myTurn || hinting}>{hinting ? t('chess.hintThinking') : t('chess.hint')}</button>
            <button type="button" class="btn" onclick={takeBack} disabled={thinking || !history.some((m) => m.color === learner)}>{t('chess.takeBack')}</button>
          {/if}
          <button type="button" class="btn" class:danger={confirmResign} onclick={resign} disabled={history.length === 0}>{confirmResign ? t('bots.resignConfirm') : t('bots.resign')}</button>
          {#if confirmResign}<button type="button" class="link" onclick={() => (confirmResign = false)}>{t('common.cancel')}</button>{/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
