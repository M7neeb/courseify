<script lang="ts">
  // Game review in two steps, like the big chess sites. First a summary: the coach's verdict, the
  // game graph with its key moments, accuracy, a game rating, how many moves of each class, and a
  // grade per phase. Then move by move: the coach explains every move, shows the best move and
  // what happens next, and lets you retry your own mistakes.
  import { onDestroy, onMount } from 'svelte';
  import { Chess, type Square } from 'chess.js';
  import ChessBoard from '../../ui/chess/ChessBoard.svelte';
  import BotAvatar from '../../ui/chess/BotAvatar.svelte';
  import { GRADE_STYLE, KIND_STYLE } from '../../ui/chess/moveKinds.ts';
  import { legalTargets, START_FEN, type BoardArrow } from '../../core/chess.ts';
  import { botById } from '../../core/bots.ts';
  import {
    BAD_KINDS,
    MOVE_KINDS,
    PHASES,
    formatEval,
    phaseGrade,
    reviewGame,
    terminalEval,
    whiteWinChance,
    winChance,
    type MoveNote,
    type ReviewedMove
  } from '../../core/review.ts';
  import { app } from '../../core/state.svelte.ts';
  import { analyse } from '../../ui/chess/stockfish.ts';
  import { chess, gameById, isReviewed, runReview, toPositionEval } from './chessStore.svelte.ts';
  import { t } from '../../i18n/i18n.ts';

  let { id }: { id: string } = $props();

  const game = $derived(gameById(id));
  const bot = $derived(game ? botById(game.botId) : undefined);
  const reviewed = $derived(game ? isReviewed(game) : false);
  const progress = $derived(chess.analysing[id]);
  const review = $derived(game && reviewed ? reviewGame(game.startFen, game.moves, game.evals ?? [], game.startFen === START_FEN) : null);
  const me = $derived(game?.color ?? 'w');
  const them = $derived(me === 'w' ? 'b' : 'w');
  const profileName = $derived(app.settings.profileName?.trim() || t('bots.you'));
  const german = $derived(app.settings.uiLanguage === 'de');
  const sides = $derived<('w' | 'b')[]>([me, them]);

  type Line = { kind: 'best' | 'follow'; fens: string[]; uci: string[]; san: string[]; step: number };
  let stage = $state<'summary' | 'review'>('summary');
  let ply = $state(0);
  let line = $state<Line | null>(null);
  let retry = $state<{ fen: string; result: 'right' | 'close' | 'wrong' | 'checking' | null; tried?: string; showAnswer?: boolean } | null>(null);
  let failed = $state(false);

  async function start() {
    failed = false;
    const ok = await runReview(id);
    if (!ok) failed = true;
  }

  onMount(() => {
    if (game && !isReviewed(game)) void start();
    window.addEventListener('keydown', onKey);
  });
  onDestroy(() => window.removeEventListener('keydown', onKey));

  const total = $derived(review?.moves.length ?? 0);
  const current = $derived<ReviewedMove | null>(review && ply > 0 ? (review.moves[ply - 1] ?? null) : null);

  function go(to: number) {
    line = null;
    retry = null;
    if (stage === 'summary') {
      stage = 'review';
      // On a phone, bring the coach and the board into view together.
      if (window.matchMedia('(max-width: 900px)').matches) {
        requestAnimationFrame(() => {
          const el = document.querySelector('.cf-review');
          if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 68 });
        });
      }
    }
    ply = Math.max(0, Math.min(total, to));
  }
  function nextKey() {
    const next = review?.keyMoments.find((p) => p > ply);
    go(next ?? total);
  }
  function prevKey() {
    const prev = review?.keyMoments.filter((p) => p < ply).at(-1);
    go(prev ?? 0);
  }
  function nextMistake() {
    if (!review) return;
    const next = review.moves.find((m) => m.ply > ply && m.color === me && BAD_KINDS.includes(m.kind));
    go(next ? next.ply : total);
  }
  function step(by: number) {
    if (line) line.step = Math.max(0, Math.min(line.fens.length - 1, line.step + by));
    else go(ply + by);
  }
  function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    // Alt+arrow is the browser's back and forward.
    if (event.altKey || event.ctrlKey || event.metaKey || !review) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (stage === 'summary') go(1);
      else step(1);
    }
  }

  function buildLine(kind: Line['kind'], fen: string, uci: readonly string[]): Line | null {
    const g = new Chess(fen);
    const fens = [g.fen()];
    const san: string[] = [];
    const used: string[] = [];
    for (const m of uci.slice(0, 8)) {
      try {
        const mv = g.move({ from: m.slice(0, 2) as Square, to: m.slice(2, 4) as Square, promotion: m[4] });
        fens.push(g.fen());
        san.push(mv.san);
        used.push(m);
      } catch {
        break;
      }
    }
    return san.length ? { kind, fens, uci: used, san, step: 1 } : null;
  }
  /** The best move and the line after it, from the position before the move played. */
  function showBest() {
    if (!current) return;
    const ev = game?.evals?.[ply - 1];
    retry = null;
    line = buildLine('best', current.fenBefore, ev?.pv?.length ? ev.pv : current.best ? [current.best.uci] : []);
  }
  /** What happens after the move played: the opponent's best answer and the line after it. */
  function showFollow() {
    if (!current) return;
    const ev = game?.evals?.[ply];
    retry = null;
    line = buildLine('follow', current.fenAfter, ev?.pv ?? (ev?.best ? [ev.best] : []));
  }
  const canFollow = $derived(!!current && !!(game?.evals?.[ply]?.pv?.length || game?.evals?.[ply]?.best));

  function startRetry() {
    if (!current) return;
    line = null;
    retry = { fen: current.fenBefore, result: null };
  }

  async function onRetryMove(from: string, to: string, promotion?: string) {
    if (!retry || !current || retry.result === 'checking') return;
    const g = new Chess(retry.fen);
    let uci: string;
    try {
      const mv = g.move({ from, to, promotion: promotion ?? 'q' });
      uci = mv.from + mv.to + (mv.promotion ?? '');
    } catch {
      return;
    }
    const before = game?.evals?.[ply - 1];
    if (uci === before?.best) {
      retry = { ...retry, result: 'right', tried: uci };
      return;
    }
    retry = { ...retry, result: 'checking', tried: uci };
    // A checkmate (or stalemate) has no engine lines; score it directly.
    const ended = terminalEval(g.fen());
    const r = ended ? null : await analyse(g.fen(), { depth: 12, movetime: 1500 });
    const after = ended ?? (r ? toPositionEval(g.fen(), r.lines) : null);
    if (!retry || retry.tried !== uci) return;
    if (!after || !before) {
      retry = { ...retry, result: 'wrong' };
      return;
    }
    const loss = winChance(before, current.color) - winChance(after, current.color);
    retry = { ...retry, result: loss <= 5 ? 'close' : 'wrong' };
  }

  // ---------- what the board shows ----------
  const finalFen = $derived(review?.moves.at(-1)?.fenAfter ?? game?.startFen ?? START_FEN);
  const boardFen = $derived(
    stage === 'summary'
      ? finalFen
      : line
        ? (line.fens[line.step] as string)
        : retry
          ? retry.fen
          : current
            ? current.fenAfter
            : (game?.startFen ?? START_FEN)
  );
  const boardLast = $derived.by<[string, string] | null>(() => {
    if (stage === 'summary') {
      const m = review?.moves.at(-1);
      return m ? [m.uci.slice(0, 2), m.uci.slice(2, 4)] : null;
    }
    if (line && line.step > 0) {
      const m = line.uci[line.step - 1] as string;
      return [m.slice(0, 2), m.slice(2, 4)];
    }
    if (retry) return null;
    return current ? [current.uci.slice(0, 2), current.uci.slice(2, 4)] : null;
  });
  const boardArrows = $derived.by<BoardArrow[]>(() => {
    if (stage === 'summary' || line) return [];
    const best = current?.best;
    if (!best) return [];
    if (retry && !retry.showAnswer) return [];
    return [{ from: best.uci.slice(0, 2), to: best.uci.slice(2, 4), tone: 'good' }];
  });
  const boardBadge = $derived.by(() => {
    if (stage === 'summary' || retry) return null;
    if (line) {
      if (line.kind !== 'best' || line.step !== 1) return null;
      const s = KIND_STYLE.best;
      return { square: (line.uci[0] as string).slice(2, 4), text: s.text, color: s.color, title: t('review.kind.best') };
    }
    if (!current) return null;
    const s = KIND_STYLE[current.kind];
    return { square: current.uci.slice(2, 4), text: s.text, color: s.color, title: t('review.kind.' + current.kind) };
  });
  const retryTargets = $derived(retry && retry.result !== 'right' && retry.result !== 'checking' ? legalTargets(new Chess(retry.fen)) : new Map<string, string[]>());

  // ---------- evaluation ----------
  const evalNow = $derived(stage === 'summary' ? (game?.evals?.[total] ?? null) : line || retry ? null : (game?.evals?.[ply] ?? null));
  const whiteShare = $derived(evalNow ? whiteWinChance(evalNow) : 50);

  function noteText(note: MoveNote): string {
    const params = { ...(note.params ?? {}) };
    if (note.key === 'book') params.name = german ? String(params.nameDe) : String(params.name);
    for (const k of ['piece', 'a', 'b']) if (typeof params[k] === 'string') params[k] = t('chess.' + params[k]);
    return t('review.why.' + note.key, params);
  }
  /** "You" phrasing for your own moves; the bot's moves are named by the bot. */
  function moveTitle(m: ReviewedMove): string {
    return t('review.is.' + m.kind, { move: m.san });
  }

  // ---------- summary ----------
  const summaryLines = $derived.by(() => {
    if (!review || !bot) return [] as string[];
    const out = [t('review.sum.' + phaseGrade(review.accuracy[me]))];
    const worst = (side: 'w' | 'b') =>
      review.moves.filter((m) => m.color === side && m.kind !== 'book' && m.loss >= 10).sort((a, b) => b.loss - a.loss)[0];
    const mine = worst(me);
    const theirs = worst(them);
    if (mine) out.push(t('review.sum.turnMine', { move: mine.san, n: mine.number }));
    else if (theirs) out.push(t('review.sum.turnTheirs', { name: bot.name, move: theirs.san, n: theirs.number }));
    else out.push(t('review.sum.clean'));
    return out;
  });

  // ---------- graph ----------
  const GRAPH_H = 80;
  const graphPath = $derived.by(() => {
    if (!review) return '';
    const pts = review.graph.map((w, i) => `${i},${(GRAPH_H * (100 - w)) / 100}`);
    return `M0,${GRAPH_H} L${pts.join(' L')} L${review.graph.length - 1},${GRAPH_H} Z`;
  });
  const graphWidth = $derived(Math.max(1, (review?.graph.length ?? 2) - 1));
  function graphClick(event: MouseEvent) {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    go(Math.round(((event.clientX - rect.left) / rect.width) * total));
  }
  const moments = $derived(
    (review?.keyMoments ?? []).map((p) => {
      const m = review!.moves[p - 1]!;
      return { ply: p, kind: m.kind, san: m.san, number: m.number, x: Math.max(3, Math.min(97, (100 * p) / graphWidth)), y: Math.max(12, Math.min(88, 100 - (review!.graph[p] ?? 50))) };
    })
  );

  const rows = $derived.by(() => {
    if (!review) return [] as { n: number; w?: ReviewedMove; b?: ReviewedMove }[];
    const out: { n: number; w?: ReviewedMove; b?: ReviewedMove }[] = [];
    for (const m of review.moves) {
      if (m.color === 'w' || out.length === 0 || out.at(-1)!.n !== m.number || out.at(-1)!.b) out.push({ n: m.number, [m.color]: m });
      else out.at(-1)!.b = m;
    }
    return out;
  });

  $effect(() => {
    // Keep the current move in view by scrolling the move list only, never the page.
    void ply;
    void stage;
    const list = document.querySelector<HTMLElement>('.cf-review-moves');
    const on = list?.querySelector<HTMLElement>('.on');
    if (!list || !on) return;
    const box = list.getBoundingClientRect();
    const item = on.getBoundingClientRect();
    if (item.top < box.top) list.scrollTop -= box.top - item.top + 6;
    else if (item.bottom > box.bottom) list.scrollTop += item.bottom - box.bottom + 6;
  });
</script>

{#snippet kindIcon(kind: keyof typeof KIND_STYLE, small = false)}
  <span class="cf-kind" class:small style:background={KIND_STYLE[kind].color} aria-hidden="true">{KIND_STYLE[kind].text}</span>
{/snippet}

{#snippet graph()}
  <div class="cf-graph-wrap">
    <!-- The move list and the key-moment buttons do the same job for keyboard and screen reader users. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <svg class="cf-graph" viewBox={`0 0 ${graphWidth} ${GRAPH_H}`} preserveAspectRatio="none" role="img" aria-label={t('review.graphLabel')} onclick={graphClick}>
      <rect x="0" y="0" width={graphWidth} height={GRAPH_H} class="bg" />
      <path d={graphPath} class="area" />
      <line x1="0" x2={graphWidth} y1={GRAPH_H / 2} y2={GRAPH_H / 2} class="mid" />
      {#if stage === 'review'}<line x1={ply} x2={ply} y1="0" y2={GRAPH_H} class="now" />{/if}
    </svg>
    {#each moments as m (m.ply)}
      <button
        type="button"
        class="cf-graph-dot"
        style:left={m.x + '%'}
        style:top={m.y + '%'}
        style:background={KIND_STYLE[m.kind].color}
        aria-label={`${t('review.keyMoment')}: ${m.number}. ${m.san}, ${t('review.kind.' + m.kind)}`}
        title={`${m.number}. ${m.san}: ${t('review.kind.' + m.kind)}`}
        onclick={() => go(m.ply)}
      ></button>
    {/each}
  </div>
{/snippet}

{#if !game || !bot}
  <p>{t('bots.notFound')}</p>
  <p><a class="btn" href="#/play/games">{t('play.tab.games')}</a></p>
{:else if !review}
  <div class="cf-review-wait">
    <BotAvatar {bot} size={48} />
    {#if failed || progress?.failed}
      <p>{t('review.engineMissing')}</p>
      <button type="button" class="btn primary" onclick={start}>{t('review.tryAgain')}</button>
    {:else}
      <p class="cf-review-wait-title">{t('review.analysing')}</p>
      <div class="cf-progress" role="progressbar" aria-valuemin="0" aria-valuemax={progress?.total ?? 1} aria-valuenow={progress?.done ?? 0}>
        <span style:width={progress ? (100 * progress.done) / Math.max(1, progress.total) + '%' : '0%'}></span>
      </div>
      <p class="muted small">{progress ? t('review.progress', { done: progress.done, total: progress.total }) : t('bots.engineLoading')}</p>
      <p class="muted small">{t('review.keepsGoing')}</p>
    {/if}
  </div>
{:else}
  <div class="cf-review" data-stage={stage}>
    <!-- The coach: on phones it sits above the board, so every comment is in view while stepping. -->
    <div class="cf-coach" aria-live="polite">
      <span class="cf-coach-avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M8 21h10v-2.2c0-1.6-.7-3-1.6-4.4 1.1-.5 2.1-1.6 2.1-3.4 0-3.4-2.6-6.5-6.4-7.4L11 2l-.9 2.2C7.4 5.4 5.5 8 5.5 11.3l2.3-.6.7 1.5L6.6 14c-.4 1.5.3 2.6 1.4 3.2zM10 9.2a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8"/></svg>
      </span>
      <div class="cf-coach-bubble">
        {#if stage === 'summary'}
          <p class="cf-coach-title">{t('review.startTitle')}</p>
          {#each summaryLines as s, i (i)}<p>{s}</p>{/each}
          {#if review.opening}<p class="muted">{t('review.openingName', { name: german ? review.opening.de : review.opening.en })}</p>{/if}
        {:else if retry}
          <p class="cf-coach-title">{t('review.retryTitle', { move: current?.san ?? '' })}</p>
          {#if retry.result === 'right'}
            <p class="cf-coach-good">{t('review.retryRight')}</p>
          {:else if retry.result === 'close'}
            <p class="cf-coach-good">{t('review.retryClose', { best: current?.best?.san ?? '' })}</p>
          {:else if retry.result === 'wrong'}
            <p class="cf-coach-bad">{t('review.retryWrong')}</p>
          {:else if retry.result === 'checking'}
            <p class="muted">{t('chess.hintThinking')}</p>
          {:else}
            <p>{t('review.retryAsk')}</p>
          {/if}
          <div class="cf-chess-controls">
            {#if retry.result === 'wrong' || retry.result === 'close'}
              <button type="button" class="btn" onclick={startRetry}>{t('review.retryAgain')}</button>
            {/if}
            {#if retry.result !== 'right'}
              <button type="button" class="btn" onclick={() => retry && (retry.showAnswer = true)}>{t('review.showAnswer')}</button>
            {/if}
            <button type="button" class="btn" onclick={() => (retry = null)}>{t('review.backToGame')}</button>
          </div>
        {:else if line}
          <p class="cf-coach-title">
            {#if line.kind === 'best'}{@render kindIcon('best')}{t('review.bestTitle', { move: line.san[0] ?? '' })}{:else}{t('review.followTitle')}{/if}
          </p>
          <p class="cf-line">
            {#each line.san as san, i (i)}
              <button type="button" class="cf-line-move" class:on={line.step === i + 1} onclick={() => line && (line.step = i + 1)}>{san}</button>
            {/each}
          </p>
          <div class="cf-chess-controls">
            <button type="button" class="btn" onclick={() => (line = null)}>{t('review.backToGame')}</button>
          </div>
        {:else if current}
          <p class="cf-coach-title">
            {@render kindIcon(current.kind)}
            <span>{moveTitle(current)}</span>
            <span class="cf-coach-eval" data-side={whiteShare >= 50 ? 'w' : 'b'}>{formatEval(game.evals?.[ply])}</span>
          </p>
          {#each current.notes as note, i (i)}<p>{noteText(note)}</p>{/each}
          {#if current.best}<p class="cf-coach-best">{t('review.bestWas', { move: current.best.san })}</p>{/if}
          <div class="cf-chess-controls">
            {#if current.best && current.kind !== 'book'}
              <button type="button" class="btn" onclick={showBest}>{t('review.best')}</button>
            {/if}
            {#if canFollow && current.kind !== 'book'}
              <button type="button" class="btn" onclick={showFollow}>{t('review.followUp')}</button>
            {/if}
            {#if current.color === me && BAD_KINDS.includes(current.kind)}
              <button type="button" class="btn primary" onclick={startRetry}>{t('review.retry')}</button>
            {/if}
          </div>
        {:else}
          <p class="cf-coach-title">{t('review.startTitle')}</p>
          <p>{t('review.startText')}</p>
        {/if}
      </div>
    </div>

    <div class="cf-review-board">
      <div class="cf-player-bar">
        {#if them === game.color}<span class="cf-you-dot" data-color={them} aria-hidden="true"></span>{/if}
        <BotAvatar {bot} size={28} />
        <span class="cf-player-name">{bot.name} <span class="muted">({bot.elo})</span></span>
      </div>
      <div class="cf-review-boardrow">
        <div class="cf-evalbar" class:flip={me === 'b'} aria-label={t('review.evalLabel', { value: formatEval(evalNow) })} role="img">
          <span class="white" style:height={whiteShare + '%'}></span>
          <span class="cf-evalbar-text" class:top={(me === 'w') === whiteShare < 50}>{formatEval(evalNow)}</span>
        </div>
        <div class="cf-review-boardcell">
          <ChessBoard
            fen={boardFen}
            orientation={me}
            movable={retry && retry.result !== 'right' && retry.result !== 'checking' ? me : null}
            targets={retryTargets}
            lastMove={boardLast}
            arrows={boardArrows}
            badge={boardBadge}
            label={t('review.boardLabel')}
            annotate
            onmove={onRetryMove}
          />
        </div>
      </div>
      <div class="cf-player-bar">
        <span class="cf-you-dot" data-color={me} aria-hidden="true"></span>
        <span class="cf-player-name">{profileName}</span>
      </div>
      <div class="cf-review-nav" role="group" aria-label={t('review.navLabel')}>
        {#if stage === 'summary'}
          <button type="button" class="btn primary cf-review-start" onclick={() => go(1)}>{t('review.startButton')}</button>
        {:else}
          <button type="button" class="btn" onclick={() => (line ? line && (line.step = 0) : go(0))} aria-label={t('chess.first')}>«</button>
          <button type="button" class="btn" onclick={() => step(-1)} disabled={!line && ply === 0} aria-label={t('chess.back')}>‹</button>
          <button type="button" class="btn primary cf-review-next" onclick={() => step(1)} disabled={line ? line.step >= line.fens.length - 1 : ply >= total} aria-label={t('chess.next')}>›</button>
          <button type="button" class="btn" onclick={() => (line ? line && (line.step = line.fens.length - 1) : go(total))} aria-label={t('chess.last')}>»</button>
          <button type="button" class="btn" onclick={prevKey} disabled={!review.keyMoments.some((p) => p < ply)} aria-label={t('review.prevKey')}>
            <span class="cf-key-dot" aria-hidden="true"></span>‹
          </button>
          <button type="button" class="btn" onclick={nextKey} disabled={!review.keyMoments.some((p) => p > ply)} aria-label={t('review.nextKey')}>
            ›<span class="cf-key-dot" aria-hidden="true"></span>
          </button>
        {/if}
      </div>
    </div>

    <div class="cf-review-side">
      {#if stage === 'summary'}
        {@render graph()}
        <div class="cf-review-summary">
          <table class="cf-sum-table">
            <thead>
              <tr>
                <th scope="col"><span class="cf-sum-player"><span class="cf-you-dot" data-color={me} aria-hidden="true"></span>{profileName}</span></th>
                <th scope="col"><span class="sr-only">{t('review.players')}</span></th>
                <th scope="col"><span class="cf-sum-player"><BotAvatar {bot} size={22} />{bot.name}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr class="cf-sum-acc">
                <td><span class="cf-acc-num" data-side={me}>{review.accuracy[me].toFixed(1)}</span></td>
                <th scope="row"><span class="cf-acc-label">{t('review.accuracy')}</span></th>
                <td><span class="cf-acc-num" data-side={them}>{review.accuracy[them].toFixed(1)}</span></td>
              </tr>
              <tr class="cf-sum-rating" title={t('review.ratingHint')}>
                <td>{review.rating[me]}</td>
                <th scope="row">{t('review.gameRating')}</th>
                <td>{review.rating[them]}</td>
              </tr>
              {#each MOVE_KINDS as k (k)}
                <tr class="cf-sum-kind" data-kind={k} class:zero={review.counts[me][k] + review.counts[them][k] === 0}>
                  <td style:color={review.counts[me][k] ? KIND_STYLE[k].color : undefined}>{review.counts[me][k]}</td>
                  <th scope="row">{@render kindIcon(k)}{t('review.kind.' + k)}</th>
                  <td style:color={review.counts[them][k] ? KIND_STYLE[k].color : undefined}>{review.counts[them][k]}</td>
                </tr>
              {/each}
              {#each PHASES as phase, i (phase)}
                <tr class="cf-sum-phase" class:first={i === 0}>
                  {#each sides as side, j (j)}
                    {#if j === 1}<th scope="row">{t('review.phase.' + phase)}</th>{/if}
                    {@const grade = review.phases[phase][side]}
                    <td>
                      {#if grade}
                        <span class="cf-kind" style:background={GRADE_STYLE[grade].color} title={t('review.grade.' + grade)} aria-hidden="true">{GRADE_STYLE[grade].text}</span>
                        <span class="sr-only">{t('review.grade.' + grade)}</span>
                      {:else}
                        <span class="muted">–</span>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="cf-review-tabs">
          <button type="button" class="cf-link" onclick={() => { line = null; retry = null; stage = 'summary'; }}>‹ {t('review.summary')}</button>
          <span class="cf-review-acc">{t('review.accuracy')}: <strong>{review.accuracy[me].toFixed(1)}</strong> · <strong>{review.accuracy[them].toFixed(1)}</strong></span>
        </div>
        {@render graph()}
        <ol class="cf-review-moves" aria-label={t('bots.moves')}>
          {#each rows as row, i (i)}
            <li>
              <span class="n">{row.n}.</span>
              {#each [row.w, row.b] as m, j (j)}
                {#if m}
                  <button type="button" class="cf-rmove" class:on={m.ply === ply} aria-current={m.ply === ply ? 'true' : undefined} onclick={() => go(m.ply)}>
                    <span class="cf-kind small" style:background={KIND_STYLE[m.kind].color} title={t('review.kind.' + m.kind)} aria-hidden="true">{KIND_STYLE[m.kind].text}</span>{m.san}
                  </button>
                {:else}
                  <span></span>
                {/if}
              {/each}
            </li>
          {/each}
        </ol>
        <p class="cf-review-jump"><button type="button" class="cf-link" onclick={nextMistake}>{t('review.nextMistake')} ›</button></p>
      {/if}
    </div>
  </div>
{/if}
