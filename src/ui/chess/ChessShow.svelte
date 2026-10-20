<script lang="ts">
  // A worked example: step through moves, each with a short note, arrows and marked squares.
  import { untrack } from 'svelte';
  import { Chess } from 'chess.js';
  import ChessBoard from './ChessBoard.svelte';
  import { formatLine, playMove, sideToMove, START_FEN, uciOf, type BoardArrow, type Color, type ShowStep } from '../../core/chess.ts';
  import { t } from '../../i18n/i18n.ts';

  let {
    fen = START_FEN,
    steps = [],
    arrows = [],
    highlights = [],
    caption = '',
    orientation
  }: {
    fen?: string;
    steps?: ShowStep[];
    /** Arrows and marks for the starting position. */
    arrows?: string[];
    highlights?: string[];
    caption?: string;
    orientation?: Color;
  } = $props();

  interface Frame {
    fen: string;
    lastMove: [string, string] | null;
    note: string;
    arrows: BoardArrow[];
    highlights: string[];
    uci: string | null;
  }

  function toArrows(list: string[] | undefined, tone: BoardArrow['tone'] = 'plan'): BoardArrow[] {
    return (list ?? []).filter((a) => /^[a-h][1-8][a-h][1-8]$/.test(a)).map((a) => ({ from: a.slice(0, 2), to: a.slice(2, 4), tone }));
  }

  /** One frame per step, plus the starting position as frame 0. */
  const frames = $derived.by<Frame[]>(() => {
    const game = new Chess(fen);
    const out: Frame[] = [{ fen, lastMove: null, note: caption, arrows: toArrows(arrows), highlights: highlights ?? [], uci: null }];
    for (const step of steps) {
      let lastMove: [string, string] | null = out.at(-1)?.lastMove ?? null;
      let uci: string | null = null;
      if (step.move) {
        const move = playMove(game, step.move);
        if (move) {
          lastMove = [move.from, move.to];
          uci = uciOf(move);
        }
      }
      out.push({ fen: game.fen(), lastMove, note: step.note ?? '', arrows: toArrows(step.arrows), highlights: step.highlights ?? [], uci });
    }
    return out;
  });

  let index = $state(0);
  const frame = $derived(frames[Math.min(index, frames.length - 1)] as Frame);
  const view = $derived<Color>(untrack(() => orientation) ?? sideToMove(fen));
  const played = $derived(frames.slice(1, index + 1).map((f) => f.uci).filter((u): u is string => u !== null));

  function go(to: number) {
    index = Math.max(0, Math.min(frames.length - 1, to));
  }

  function onkey(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') go(index + 1);
    else if (event.key === 'ArrowLeft') go(index - 1);
    else return;
    event.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="cf-chess cf-chess-show" role="region" aria-label={t('chess.example')} onkeydown={onkey}>
  <div class="cf-chess-layout">
    <ChessBoard fen={frame.fen} orientation={view} lastMove={frame.lastMove} arrows={frame.arrows} highlights={frame.highlights} label={t('chess.example')} />
    <div class="cf-chess-side">
      {#if frame.note}
        <p class="cf-chess-note" aria-live="polite">{frame.note}</p>
      {/if}
      {#if played.length > 0}<p class="cf-chess-moves">{formatLine(fen, played)}</p>{/if}
      {#if frames.length > 1}
        <div class="cf-chess-controls">
          <button type="button" class="btn" aria-label={t('chess.first')} disabled={index === 0} onclick={() => go(0)}>|&lt;</button>
          <button type="button" class="btn" aria-label={t('chess.back')} disabled={index === 0} onclick={() => go(index - 1)}>&lt;</button>
          <button type="button" class="btn primary" disabled={index === frames.length - 1} onclick={() => go(index + 1)}>{index === 0 ? t('chess.startExample') : t('chess.next')}</button>
          <button type="button" class="btn" aria-label={t('chess.last')} disabled={index === frames.length - 1} onclick={() => go(frames.length - 1)}>&gt;|</button>
          <span class="cf-step-count">{t('chess.stepOf', { n: index, total: frames.length - 1 })}</span>
        </div>
      {/if}
    </div>
  </div>
</div>
