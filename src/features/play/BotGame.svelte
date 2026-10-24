<script lang="ts">
  // A game against a bot. Every move is saved, so a game can be left and continued later (the
  // clocks stop while you are away). With a clock you can premove while the bot thinks.
  import { onDestroy, onMount, untrack } from 'svelte';
  import { Chess, type Move, type Square } from 'chess.js';
  import ChessBoard from '../../ui/chess/ChessBoard.svelte';
  import BotAvatar from '../../ui/chess/BotAvatar.svelte';
  import Celebrate from '../../ui/Celebrate.svelte';
  import { playCelebrate } from '../../ui/sound.ts';
  import { playGameEnd, playGameStart, playLowTime, playMoveSound } from '../../ui/chess/chessSounds.ts';
  import { chessPrefs } from '../../ui/chess/prefs.svelte.ts';
  import { legalTargets, type BoardArrow } from '../../core/chess.ts';
  import { botById } from '../../core/bots.ts';
  import { botThinkTime, canMate, capturedPieces, formatClock, timeLabel } from '../../core/clock.ts';
  import { app, navigate } from '../../core/state.svelte.ts';
  import type { SavedGame } from '../../core/types.ts';
  import { applyRating, bestMoveFor, botAcceptsDraw, botMove, chess, deleteGame, gameById, newGameId, saveGame } from './chessStore.svelte.ts';
  import { newGame as engineNewGame } from '../../ui/chess/stockfish.ts';
  import { t } from '../../i18n/i18n.ts';

  let { id }: { id: string } = $props();

  const GLYPH: Record<string, string> = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

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
  let flipped = $state(false);
  let premove = $state<{ from: string; to: string; promotion?: string } | null>(null);
  let chat = $state('');
  let drawState = $state<'idle' | 'asking' | 'declined'>('idle');
  let lastOfferPly = $state(-99);
  let generation = 0;
  let destroyed = false;

  const learner = saved?.color ?? 'w';
  const botColor = learner === 'w' ? 'b' : 'w';
  const finished = $derived(Boolean(record?.result));
  const turnColor = $derived<'w' | 'b'>(fen.split(' ')[1] === 'b' ? 'b' : 'w');
  const myTurn = $derived(!finished && !thinking && turnColor === learner);
  const targets = $derived(myTurn ? legalTargets(new Chess(fen)) : new Map<string, string[]>());
  const canPremove = $derived(!finished && !myTurn && chessPrefs.premoves && turnColor === botColor);
  const preTargets = $derived(canPremove ? premoveTargets(fen) : new Map<string, string[]>());
  const lastMove = $derived<[string, string] | null>(history.length > 0 ? [history.at(-1)!.from, history.at(-1)!.to] : null);
  const marks = $derived.by(() => {
    const out: Record<string, 'bad' | 'premove'> = {};
    const g = new Chess(fen);
    if (g.inCheck()) for (const row of g.board()) for (const sq of row) if (sq && sq.type === 'k' && sq.color === g.turn()) out[sq.square] = 'bad';
    if (premove) {
      out[premove.from] = 'premove';
      out[premove.to] = 'premove';
    }
    return out;
  });
  const lost = $derived(capturedPieces(fen));
  const myAdvantage = $derived(learner === 'w' ? lost.diff : -lost.diff);
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
  const orientation = $derived<'w' | 'b'>(flipped ? botColor : learner);
  const myMoves = $derived(history.filter((m) => m.color === learner).length);

  // ---------- clocks ----------
  const tc = saved?.time ?? null;
  let clock = $state({ w: saved?.clock?.w ?? (tc ? tc.base * 1000 : 0), b: saved?.clock?.b ?? (tc ? tc.base * 1000 : 0) });
  let turnStart = performance.now();
  let now = $state(performance.now());
  let warnedLow = false;
  /** Clocks start once both sides have made a move, as on lichess. */
  const running = $derived(Boolean(tc) && !finished && history.length >= 2);
  const shown = $derived({
    w: running && turnColor === 'w' ? clock.w - (now - turnStart) : clock.w,
    b: running && turnColor === 'b' ? clock.b - (now - turnStart) : clock.b
  });
  let ticker: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    if (tc) {
      ticker = setInterval(() => {
        now = performance.now();
        if (!running || !record) return;
        const left = shown[turnColor];
        if (turnColor === learner && !warnedLow && left < 10_000 && tc.base >= 60) {
          warnedLow = true;
          playLowTime();
        }
        if (left <= 0) flag(turnColor);
      }, 100);
    }
    if (record && history.length === 0 && !record.result) playGameStart();
    chat = record && !record.result && history.length < 2 ? hello() : '';
  });

  onDestroy(() => {
    destroyed = true;
    clearInterval(ticker);
    // Leaving stops the clock: what was used on this turn is kept.
    if (tc && running && record && !record.result) {
      const spent = performance.now() - turnStart;
      clock[turnColor] = Math.max(0, clock[turnColor] - spent);
      void saveGame({ ...$state.snapshot(record), clock: { ...clock } } as SavedGame);
    }
  });

  function hello(): string {
    if (!bot) return '';
    return bot.custom ? t('bots.hello.custom', { elo: bot.elo }) : t('bots.hello.' + bot.id);
  }

  function say(event: string) {
    if (!bot) return;
    chat = t(`bots.chat.${bot.style}.${event}`, { name: profileName });
  }

  /** Squares the learner could premove to: their moves as if it were already their turn. */
  function premoveTargets(position: string): Map<string, string[]> {
    const parts = position.split(' ');
    parts[1] = learner;
    parts[3] = '-';
    try {
      return legalTargets(new Chess(parts.join(' ')));
    } catch {
      return new Map();
    }
  }

  async function persist(patch: Partial<SavedGame> = {}) {
    if (!record) return;
    record = { ...record, ...patch, moves: history.map((m) => m.from + m.to + (m.promotion ?? '')), ...(tc ? { clock: { ...clock } } : {}) };
    await saveGame(record);
  }

  async function finish(result: NonNullable<SavedGame['result']>, reason: string) {
    if (!record || record.result) return;
    generation += 1;
    thinking = false;
    premove = null;
    await persist({ result, reason, finishedAt: new Date().toISOString() });
    playGameEnd();
    say(result === 'won' ? 'botLost' : result === 'lost' ? 'botWon' : 'draw');
    if (record?.rated) {
      const change = await applyRating(record);
      if (change !== undefined) await persist({ ratingChange: change });
    }
    if (result === 'won' && app.settings.sounds && app.settings.celebrations) playCelebrate();
  }

  /** Ends the game when the position says so. Returns true when it is over. */
  function judge(): boolean {
    if (!record || record.result) return true;
    if (game.isCheckmate()) void finish(game.turn() === learner ? 'lost' : 'won', 'mate');
    else if (game.isStalemate()) void finish('draw', 'stalemate');
    else if (game.isInsufficientMaterial()) void finish('draw', 'material');
    else if (game.isThreefoldRepetition()) void finish('draw', 'repetition');
    else if (game.isDraw()) void finish('draw', 'fifty');
    else return false;
    return true;
  }

  /** A side ran out of time: it loses, unless the other side could never mate. */
  function flag(color: 'w' | 'b') {
    if (!record || record.result) return;
    clock[color] = 0;
    const other = color === 'w' ? 'b' : 'w';
    const result = canMate(fen, other) ? (color === learner ? 'lost' : 'won') : 'draw';
    void finish(result, result === 'draw' ? 'timeoutMaterial' : 'timeout');
  }

  /** Charges the clock of the side that just moved and adds its increment. */
  function punchClock(color: 'w' | 'b') {
    if (!tc) return;
    // The mover's clock ran during this turn when two moves had been made before it.
    if (history.length >= 3) clock[color] = Math.max(0, clock[color] - (performance.now() - turnStart)) + tc.inc * 1000;
    turnStart = performance.now();
    now = turnStart;
    const times = [...(record?.times ?? []), Math.round(clock[color])];
    if (record) record = { ...record, times };
  }

  function applyMove(from: string, to: string, promotion?: string): Move | null {
    try {
      const move = game.move({ from, to, promotion: promotion ?? 'q' });
      fen = game.fen();
      history = game.history({ verbose: true });
      playMoveSound(move, game.inCheck());
      return move;
    } catch {
      return null;
    }
  }

  async function botTurn() {
    if (!record || !bot || record.result) return;
    const mine = generation;
    thinking = true;
    const thinkMs = tc ? botThinkTime(clock[botColor], tc.inc, 1500) : undefined;
    const uci = await botMove(game.fen(), bot.id, { played: history.map((m) => m.from + m.to + (m.promotion ?? '')), startFen: record.startFen, thinkMs });
    if (mine !== generation || destroyed || !record || record.result) return;
    thinking = false;
    if (!uci) return;
    const before = myAdvantage;
    const move = applyMove(uci.slice(0, 2), uci.slice(2, 4), uci[4]);
    if (!move) return;
    punchClock(botColor);
    if (judge()) return;
    // A word from the bot now and then.
    if (game.inCheck()) say('check');
    else if (move.captured && move.captured !== 'p') say('capture');
    else if (myAdvantage <= -3 && before > -3) say('winning');
    else if (myAdvantage >= 3 && before < 3) say('losing');
    void persist();
    // A premove goes straight in when it is still legal.
    if (premove) {
      const p = premove;
      premove = null;
      if (new Chess(fen).moves({ verbose: true }).some((m) => m.from === p.from && m.to === p.to)) learnerMove(p.from, p.to, p.promotion);
    }
  }

  function learnerMove(from: string, to: string, promotion?: string) {
    const move = applyMove(from, to, promotion);
    if (!move) return;
    hintArrow = null;
    confirmResign = false;
    if (drawState === 'declined') drawState = 'idle';
    punchClock(learner);
    if (judge()) return;
    void persist();
    void botTurn();
  }

  function onmove(from: string, to: string, promotion?: string) {
    if (myTurn) learnerMove(from, to, promotion);
    else if (canPremove) premove = { from, to, promotion };
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
    premove = null;
    turnStart = performance.now();
    void persist({ assisted: true, times: (record.times ?? []).slice(0, index) });
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
    confirmResign = false;
    void finish('lost', 'resign');
  }

  /** Before your first move a game can be called off; it is not saved. */
  async function abort() {
    if (!record) return;
    generation += 1;
    const gone = record.id;
    record = undefined;
    await deleteGame(gone);
    navigate({ name: 'play' });
  }

  async function offerDraw() {
    if (!record || !bot || finished || drawState === 'asking') return;
    drawState = 'asking';
    lastOfferPly = history.length;
    chat = t('bots.drawThinking', { name: bot.name });
    const yes = await botAcceptsDraw(fen, bot.id, botColor, history.length);
    if (!record || record.result || destroyed) return;
    if (yes) {
      chat = t('bots.drawYes');
      void finish('draw', 'agreement');
    } else {
      drawState = 'declined';
      chat = t('bots.drawNo');
    }
  }

  async function rematch() {
    if (!record) return;
    const next = newGameId();
    engineNewGame();
    const color = record.color === 'w' ? 'b' : 'w';
    await saveGame({
      id: next,
      botId: record.botId,
      color,
      startFen: record.startFen,
      moves: [],
      startedAt: new Date().toISOString(),
      assist: record.assist,
      rated: record.rated,
      ...(record.time ? { time: record.time, clock: { w: record.time.base * 1000, b: record.time.base * 1000 } } : {})
    });
    navigate({ name: 'play', view: 'game', id: next });
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') premove = null;
  }

  // The bot moves first when the learner plays Black, or when a saved game stopped on its turn.
  $effect(() => {
    untrack(() => {
      if (record && !record.result && game.turn() !== learner && !game.isGameOver()) void botTurn();
    });
  });
</script>

<svelte:window onkeydown={onKey} />

{#snippet clockFace(color: 'w' | 'b')}
  {#if tc}
    <span class="cf-clock" class:active={running && turnColor === color} class:low={shown[color] < 20_000} data-color={color} role="timer" aria-label={t('bots.clockLabel', { side: t(color === learner ? 'bots.you' : 'chess.' + (color === 'w' ? 'white' : 'black')) })}>
      {formatClock(shown[color])}
    </span>
  {/if}
{/snippet}

{#snippet takenBy(color: 'w' | 'b')}
  {@const pieces = color === 'w' ? lost.b : lost.w}
  {@const ahead = color === 'w' ? lost.diff : -lost.diff}
  <span class="cf-captured" data-color={color === 'w' ? 'b' : 'w'} aria-label={t('bots.capturedLabel', { n: pieces.length })}>
    {#each pieces as p, i (i)}<span class="cf-cap" class:gap={i > 0 && pieces[i - 1] !== p}>{GLYPH[p]}&#xFE0E;</span>{/each}
    {#if ahead > 0}<span class="cf-material">+{ahead}</span>{/if}
  </span>
{/snippet}

{#snippet botBar()}
  <div class="cf-player-bar">
    <BotAvatar bot={bot!} size={34} />
    <div class="cf-player-text">
      <span class="cf-player-name">{bot!.name} <span class="muted">({bot!.elo})</span></span>
      {@render takenBy(botColor)}
    </div>
    {#if thinking}<span class="cf-thinking" role="status">{t('bots.thinking')}</span>{/if}
    {@render clockFace(botColor)}
  </div>
{/snippet}

{#snippet myBar()}
  <div class="cf-player-bar">
    <span class="cf-you-dot" data-color={learner} aria-hidden="true"></span>
    <div class="cf-player-text">
      <span class="cf-player-name">{profileName}{#if chess.record.rating && record?.rated} <span class="muted">({chess.record.rating.value})</span>{/if}</span>
      {@render takenBy(learner)}
    </div>
    {@render clockFace(learner)}
  </div>
{/snippet}

{#if !record || !bot}
  <p>{t('bots.notFound')}</p>
  <p><a class="btn" href="#/play">{t('bots.choose')}</a></p>
{:else}
  <div class="cf-game">
    <div class="cf-game-board">
      {#if orientation === learner}{@render botBar()}{:else}{@render myBar()}{/if}
      <ChessBoard
        {fen}
        {orientation}
        movable={myTurn || canPremove ? learner : null}
        targets={myTurn ? targets : preTargets}
        premove={canPremove}
        {lastMove}
        {marks}
        arrows={hintArrow ? [hintArrow] : []}
        label={t('bots.boardLabel', { name: bot.name })}
        annotate
        {onmove}
        onemptyclick={() => (premove = null)}
      />
      {#if orientation === learner}{@render myBar()}{:else}{@render botBar()}{/if}
    </div>

    <div class="cf-game-side">
      <div class="cf-game-meta">
        <span>{tc ? timeLabel(tc) : t('bots.noTimer')}</span>
        <span>{record.rated ? t('bots.rated') : t('bots.casual')}</span>
      </div>

      {#if chat}
        <div class="cf-chat">
          <BotAvatar {bot} size={28} />
          <p class="cf-chat-bubble" aria-live="polite">{chat}</p>
        </div>
      {/if}

      {#if record.result}
        <div class="cf-game-over" class:won={record.result === 'won'} class:lost={record.result === 'lost'} role="status">
          <p class="cf-game-over-title">{t('bots.end.' + record.result)}</p>
          <p>{t('bots.reason.' + (record.reason ?? 'mate') + '.' + record.result, { name: bot.name })}</p>
          {#if record.ratingChange !== undefined && chess.record.rating}
            <p class="cf-rating-line">
              {t('bots.ratingNow', { rating: chess.record.rating.value })}
              <span class="cf-rating-change" class:up={record.ratingChange > 0} class:down={record.ratingChange < 0}>{record.ratingChange > 0 ? '+' : ''}{record.ratingChange}</span>
            </p>
          {/if}
          {#if record.result === 'won' && app.settings.celebrations}<Celebrate message={t('chess.wellPlayed')} />{/if}
          <div class="cf-chess-controls">
            <a class="btn primary" href={'#/play/review/' + encodeURIComponent(record.id)}>{t('bots.review')}</a>
            <button type="button" class="btn" onclick={rematch}>{t('bots.rematch')}</button>
            <a class="btn" href="#/play">{t('bots.newBot')}</a>
          </div>
        </div>
      {:else if !chat}
        <p class="cf-bot-says">{myTurn ? t('chess.yourMove') : t('bots.thinking')}</p>
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
          {#if myMoves === 0}
            <button type="button" class="btn" onclick={abort}>{t('bots.abort')}</button>
          {:else}
            <button type="button" class="btn" onclick={offerDraw} disabled={drawState === 'asking' || history.length - lastOfferPly < 10}>{t('bots.offerDraw')}</button>
            <button type="button" class="btn" class:danger={confirmResign} onclick={resign}>{confirmResign ? t('bots.resignConfirm') : t('bots.resign')}</button>
            {#if confirmResign}<button type="button" class="link" onclick={() => (confirmResign = false)}>{t('common.cancel')}</button>{/if}
          {/if}
        </div>
      {/if}
      <div class="cf-chess-controls cf-board-tools">
        <button type="button" class="btn" onclick={() => (flipped = !flipped)}>{t('chess.flip')}</button>
        {#if premove}<button type="button" class="link small" onclick={() => (premove = null)}>{t('bots.cancelPremove')}</button>{/if}
      </div>
      <p class="muted small cf-draw-tip">{t('chess.drawTip')}</p>
    </div>
  </div>
{/if}
