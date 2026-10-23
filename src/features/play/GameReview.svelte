<script lang="ts">
  // Game review: every move judged from Brilliant to Blunder, accuracy for both sides, the
  // evaluation bar and graph, the better move, its line, and a "try again" for your mistakes.
  import { onDestroy, onMount } from 'svelte';
  import { Chess, type Square } from 'chess.js';
  import ChessBoard from '../../ui/chess/ChessBoard.svelte';
  import BotAvatar from '../../ui/chess/BotAvatar.svelte';
  import { KIND_STYLE } from '../../ui/chess/moveKinds.ts';
  import { legalTargets, START_FEN, type BoardArrow } from '../../core/chess.ts';
  import { botById } from '../../core/bots.ts';
  import { BAD_KINDS, MOVE_KINDS, formatEval, reviewGame, whiteWinChance, winChance, type MoveKind, type ReviewedMove } from '../../core/review.ts';
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

  let ply = $state(0);
  let line = $state<{ fens: string[]; uci: string[]; san: string[]; step: number } | null>(null);
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
    ply = Math.max(0, Math.min(total, to));
  }
  function nextMistake() {
    if (!review) return;
    const next = review.moves.find((m) => m.ply > ply && m.color === me && BAD_KINDS.includes(m.kind));
    go(next ? next.ply : total);
  }
  function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (line) line.step = Math.max(0, line.step - 1);
      else go(ply - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (line) line.step = Math.min(line.fens.length - 1, line.step + 1);
      else go(ply + 1);
    }
  }

  function showLine() {
    if (!current) return;
    const ev = game?.evals?.[ply - 1];
    const uci = ev?.pv?.length ? ev.pv : current.best ? [current.best.uci] : [];
    const g = new Chess(current.fenBefore);
    const fens = [g.fen()];
    const san: string[] = [];
    const used: string[] = [];
    for (const m of uci.slice(0, 10)) {
      try {
        const mv = g.move({ from: m.slice(0, 2) as Square, to: m.slice(2, 4) as Square, promotion: m[4] });
        fens.push(g.fen());
        san.push(mv.san);
        used.push(m);
      } catch {
        break;
      }
    }
    if (san.length === 0) return;
    retry = null;
    line = { fens, uci: used, san, step: 1 };
  }

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
    const r = await analyse(g.fen(), { depth: 12, movetime: 1500 });
    const after = r ? toPositionEval(g.fen(), r.lines) : null;
    if (!retry || retry.tried !== uci) return;
    if (!after || !before) {
      retry = { ...retry, result: 'wrong' };
      return;
    }
    const loss = winChance(before, current.color) - winChance(after, current.color);
    retry = { ...retry, result: loss <= 5 ? 'close' : 'wrong' };
  }

  // ---------- what the board shows ----------
  const boardFen = $derived(
    line ? (line.fens[line.step] as string) : retry ? retry.fen : current ? current.fenAfter : (game?.startFen ?? START_FEN)
  );
  const boardLast = $derived.by<[string, string] | null>(() => {
    if (line && line.step > 0) {
      const m = line.uci[line.step - 1] as string;
      return [m.slice(0, 2), m.slice(2, 4)];
    }
    if (retry) return null;
    return current ? [current.uci.slice(0, 2), current.uci.slice(2, 4)] : null;
  });
  const boardArrows = $derived.by<BoardArrow[]>(() => {
    if (line) return [];
    if (retry) {
      if (retry.showAnswer && current?.best) return [{ from: current.best.uci.slice(0, 2), to: current.best.uci.slice(2, 4), tone: 'good' }];
      return [];
    }
    if (current?.best) return [{ from: current.best.uci.slice(0, 2), to: current.best.uci.slice(2, 4), tone: 'good' }];
    return [];
  });
  const boardBadge = $derived(
    !line && !retry && current ? { square: current.uci.slice(2, 4), text: KIND_STYLE[current.kind].text, color: KIND_STYLE[current.kind].color, title: t('review.kind.' + current.kind) } : null
  );
  const retryTargets = $derived(retry && retry.result !== 'right' && retry.result !== 'checking' ? legalTargets(new Chess(retry.fen)) : new Map<string, string[]>());

  // ---------- evaluation ----------
  const evalNow = $derived(line || retry ? null : (game?.evals?.[ply] ?? null));
  const whiteShare = $derived(evalNow ? whiteWinChance(evalNow) : 50);

  function kindSentence(m: ReviewedMove): string {
    return t('review.is.' + m.kind, { move: m.san });
  }
  function noteText(m: ReviewedMove): string {
    const note = m.note;
    if (!note) return '';
    const params = { ...(note.params ?? {}) };
    if (note.key === 'book') params.name = app.settings.uiLanguage === 'de' ? String(params.nameDe) : String(params.name);
    if (typeof params.piece === 'string') params.piece = t('chess.' + params.piece);
    return t('review.why.' + note.key, params);
  }

  // ---------- graph ----------
  const GRAPH_H = 60;
  const graphPath = $derived.by(() => {
    if (!review) return '';
    const pts = review.graph.map((w, i) => `${i},${(GRAPH_H * (100 - w)) / 100}`);
    return `M0,${GRAPH_H} L${pts.join(' L')} L${review.graph.length - 1},${GRAPH_H} Z`;
  });
  function graphClick(event: MouseEvent) {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    go(Math.round(((event.clientX - rect.left) / rect.width) * total));
  }

  const rows = $derived.by(() => {
    if (!review) return [] as { n: number; w?: ReviewedMove; b?: ReviewedMove }[];
    const out: { n: number; w?: ReviewedMove; b?: ReviewedMove }[] = [];
    for (const m of review.moves) {
      if (m.color === 'w' || out.length === 0 || out.at(-1)!.n !== m.number || out.at(-1)!.b) out.push({ n: m.number, [m.color]: m });
      else out.at(-1)!.b = m;
    }
    return out;
  });
  const shownKinds = $derived(MOVE_KINDS.filter((k) => review && (review.counts.w[k] > 0 || review.counts.b[k] > 0 || ['best', 'inaccuracy', 'mistake', 'blunder'].includes(k))));

  $effect(() => {
    // Keep the current move in view in the move list.
    void ply;
    document.querySelector('.cf-review-moves .on')?.scrollIntoView({ block: 'nearest' });
  });
</script>

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
  <div class="cf-review">
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
            onmove={onRetryMove}
          />
        </div>
      </div>
      <div class="cf-player-bar">
        <span class="cf-you-dot" data-color={me} aria-hidden="true"></span>
        <span class="cf-player-name">{profileName}</span>
      </div>

      <div class="cf-review-nav" role="group" aria-label={t('review.navLabel')}>
        {#if line}
          <button type="button" class="btn" onclick={() => line && (line.step = Math.max(0, line.step - 1))} aria-label={t('chess.back')}>‹</button>
          <span class="cf-step-count">{t('review.lineStep', { n: line.step, total: line.fens.length - 1 })}</span>
          <button type="button" class="btn" onclick={() => line && (line.step = Math.min(line.fens.length - 1, line.step + 1))} aria-label={t('chess.next')}>›</button>
          <button type="button" class="btn" onclick={() => (line = null)}>{t('review.backToGame')}</button>
        {:else}
          <button type="button" class="btn" onclick={() => go(0)} aria-label={t('chess.first')}>«</button>
          <button type="button" class="btn" onclick={() => go(ply - 1)} disabled={ply === 0} aria-label={t('chess.back')}>‹</button>
          <button type="button" class="btn primary" onclick={() => go(ply + 1)} disabled={ply >= total} aria-label={t('chess.next')}>›</button>
          <button type="button" class="btn" onclick={() => go(total)} aria-label={t('chess.last')}>»</button>
          <button type="button" class="btn" onclick={nextMistake}>{t('review.nextMistake')}</button>
        {/if}
      </div>
    </div>

    <div class="cf-review-side">
      <div class="cf-coach" aria-live="polite">
        {#if retry}
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
          <p class="cf-coach-title">{t('review.bestLine')}</p>
          <p class="cf-line">
            {#each line.san as san, i (i)}
              <button type="button" class="cf-line-move" class:on={line.step === i + 1} onclick={() => line && (line.step = i + 1)}>{san}</button>
            {/each}
          </p>
        {:else if current}
          <p class="cf-coach-title">
            <span class="cf-kind" style:background={KIND_STYLE[current.kind].color} aria-hidden="true">{KIND_STYLE[current.kind].text}</span>
            {kindSentence(current)}
            <span class="cf-coach-eval">{formatEval(game.evals?.[ply])}</span>
          </p>
          {#if noteText(current)}<p>{noteText(current)}</p>{/if}
          {#if current.best}<p>{t('review.bestWas', { move: current.best.san })}</p>{/if}
          <div class="cf-chess-controls">
            {#if current.bestLine.length > 0 && current.kind !== 'book'}
              <button type="button" class="btn" onclick={showLine}>{t('review.showLine')}</button>
            {/if}
            {#if current.color === me && BAD_KINDS.includes(current.kind)}
              <button type="button" class="btn primary" onclick={startRetry}>{t('review.retry')}</button>
            {/if}
          </div>
        {:else}
          <p class="cf-coach-title">{t('review.startTitle')}</p>
          <p>{review.opening ? t('review.opening', { name: app.settings.uiLanguage === 'de' ? review.opening.de : review.opening.en }) : t('review.startText')}</p>
          <div class="cf-chess-controls">
            <button type="button" class="btn primary" onclick={() => go(1)}>{t('review.startButton')}</button>
          </div>
        {/if}
      </div>

      <div class="cf-review-summary">
        <div class="cf-accuracy">
          <div><span class="cf-acc-name">{profileName}</span><span class="cf-acc-num">{review.accuracy[me].toFixed(1)}</span></div>
          <p class="cf-acc-label">{t('review.accuracy')}</p>
          <div><span class="cf-acc-name">{bot.name}</span><span class="cf-acc-num">{review.accuracy[them].toFixed(1)}</span></div>
        </div>
        <table class="cf-kind-table">
          <thead><tr><th scope="col">{t('review.you')}</th><th scope="col"></th><th scope="col">{bot.name}</th></tr></thead>
          <tbody>
            {#each shownKinds as k (k)}
              <tr>
                <td>{review.counts[me][k as MoveKind]}</td>
                <th scope="row"><span class="cf-kind" style:background={KIND_STYLE[k].color} aria-hidden="true">{KIND_STYLE[k].text}</span>{t('review.kind.' + k)}</th>
                <td>{review.counts[them][k as MoveKind]}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- The move list below does the same job for keyboard and screen reader users. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <svg class="cf-graph" viewBox={`0 0 ${Math.max(1, review.graph.length - 1)} ${GRAPH_H}`} preserveAspectRatio="none" role="img" aria-label={t('review.graphLabel')} onclick={graphClick}>
        <rect x="0" y="0" width={Math.max(1, review.graph.length - 1)} height={GRAPH_H} class="bg" />
        <path d={graphPath} class="area" />
        <line x1="0" x2={Math.max(1, review.graph.length - 1)} y1={GRAPH_H / 2} y2={GRAPH_H / 2} class="mid" />
        <line x1={ply} x2={ply} y1="0" y2={GRAPH_H} class="now" />
      </svg>

      <ol class="cf-review-moves" aria-label={t('bots.moves')}>
        {#each rows as row, i (i)}
          <li>
            <span class="n">{row.n}.</span>
            {#each [row.w, row.b] as m, j (j)}
              {#if m}
                <button type="button" class="cf-rmove" class:on={m.ply === ply} onclick={() => go(m.ply)}>
                  <span class="cf-kind small" style:background={KIND_STYLE[m.kind].color} title={t('review.kind.' + m.kind)} aria-hidden="true">{KIND_STYLE[m.kind].text}</span>{m.san}
                </button>
              {:else}
                <span></span>
              {/if}
            {/each}
          </li>
        {/each}
      </ol>
    </div>
  </div>
{/if}
