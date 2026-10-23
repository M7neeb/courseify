<script lang="ts">
  // A chessboard: shows a position and lets one side move by dragging or by tapping a piece and
  // then a square. It knows no rules itself: the parent passes the legal targets and decides what
  // a move does. Squares are buttons, so the board also works with a keyboard and screen reader.
  import { t } from '../../i18n/i18n.ts';

  import type { BoardArrow as Arrow, Color } from '../../core/chess.ts';

  let {
    fen,
    orientation = 'w',
    movable = null,
    targets = new Map<string, string[]>(),
    lastMove = null,
    arrows = [],
    highlights = [],
    marks = {},
    animate = true,
    label = '',
    badge = null,
    onmove
  }: {
    fen: string;
    orientation?: Color;
    /** The side the learner may move, or null for a board you only look at. */
    movable?: Color | null;
    /** Legal target squares per starting square. */
    targets?: Map<string, string[]>;
    lastMove?: [string, string] | null;
    arrows?: Arrow[];
    highlights?: string[];
    /** Squares coloured to show a result: 'good' (right move), 'bad' (wrong), 'hint'. */
    marks?: Record<string, 'good' | 'bad' | 'hint'>;
    animate?: boolean;
    label?: string;
    /** A small round mark on one square, such as a move's review class ("??" on red). */
    badge?: { square: string; text: string; color: string; title?: string } | null;
    onmove?: (from: string, to: string, promotion?: string) => void;
  } = $props();

  const FILES = 'abcdefgh';
  const FILLED: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const OUTLINE: Record<string, string> = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };
  const NAMES: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

  /** Square name -> piece ("wn", "bp"), read from the FEN placement field. */
  const pieces = $derived.by(() => {
    const out = new Map<string, string>();
    const rows = (fen.split(/\s+/)[0] ?? '').split('/');
    rows.forEach((row, r) => {
      let file = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) file += Number(ch);
        else {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          out.set(`${FILES[file]}${8 - r}`, color + ch.toLowerCase());
          file += 1;
        }
      }
    });
    return out;
  });
  const turn = $derived<Color>(fen.split(/\s+/)[1] === 'b' ? 'b' : 'w');

  /** Squares in display order: rank 8 first for White, rank 1 first for Black. */
  const squares = $derived.by(() => {
    const out: string[] = [];
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const file = orientation === 'w' ? col : 7 - col;
        const rank = orientation === 'w' ? 8 - row : row + 1;
        out.push(`${FILES[file]}${rank}`);
      }
    }
    return out;
  });

  /** The king in check, if any: the side to move's king when the FEN says so is not known, so
   * the parent marks it through `marks`; here only the light/dark colour is computed. */
  function isDark(square: string): boolean {
    return (FILES.indexOf(square[0] as string) + Number(square[1])) % 2 === 0;
  }

  /** Display position (0-7 column, 0-7 row) of a square. */
  function cell(square: string): { col: number; row: number } {
    const file = FILES.indexOf(square[0] as string);
    const rank = Number(square[1]);
    return orientation === 'w' ? { col: file, row: 8 - rank } : { col: 7 - file, row: rank - 1 };
  }

  let selected = $state<string | null>(null);
  let drag = $state<{ from: string; x: number; y: number; moved: boolean } | null>(null);
  let promotion = $state<{ from: string; to: string } | null>(null);
  let boardEl: HTMLDivElement | undefined = $state();

  const selectedTargets = $derived(selected ? (targets.get(selected) ?? []) : []);

  // A new position (a reply, a reset) clears any half-made move.
  $effect(() => {
    void fen;
    selected = null;
    promotion = null;
  });

  function canMove(square: string): boolean {
    const piece = pieces.get(square);
    return movable !== null && movable === turn && piece !== undefined && piece[0] === movable && (targets.get(square)?.length ?? 0) > 0;
  }

  function attempt(from: string, to: string) {
    if (!(targets.get(from) ?? []).includes(to)) return false;
    const piece = pieces.get(from);
    if (piece?.[1] === 'p' && (to[1] === '8' || to[1] === '1')) {
      promotion = { from, to };
      return true;
    }
    selected = null;
    onmove?.(from, to);
    return true;
  }

  function choosePromotion(piece: string) {
    if (!promotion) return;
    const { from, to } = promotion;
    promotion = null;
    selected = null;
    onmove?.(from, to, piece);
  }

  function clickSquare(square: string) {
    if (promotion) return;
    if (selected && selected !== square && attempt(selected, square)) return;
    selected = canMove(square) && selected !== square ? square : null;
  }

  function squareAt(clientX: number, clientY: number): string | null {
    if (!boardEl) return null;
    const rect = boardEl.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const file = orientation === 'w' ? col : 7 - col;
    const rank = orientation === 'w' ? 8 - row : row + 1;
    return `${FILES[file]}${rank}`;
  }

  // A drag starts after the pointer moves a few pixels; a plain tap is left to the click handler.
  let suppressClick = false;

  function pointerDown(event: PointerEvent, square: string) {
    suppressClick = false;
    if (promotion || event.button !== 0 || !canMove(square)) return;
    drag = { from: square, x: event.clientX, y: event.clientY, moved: false };
  }

  function pointerMove(event: PointerEvent) {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6;
    if (moved && !drag.moved) {
      boardEl?.setPointerCapture(event.pointerId);
      selected = drag.from;
    }
    drag = { ...drag, x: event.clientX, y: event.clientY, moved };
  }

  function pointerUp(event: PointerEvent) {
    if (!drag) return;
    const { from, moved } = drag;
    drag = null;
    if (!moved) return;
    suppressClick = true;
    const to = squareAt(event.clientX, event.clientY);
    if (to && to !== from && attempt(from, to)) return;
    selected = from;
  }

  function onSquareClick(square: string) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    clickSquare(square);
  }

  function pieceName(piece: string): string {
    return t('chess.piece', { color: t(piece[0] === 'w' ? 'chess.white' : 'chess.black'), piece: t('chess.' + NAMES[piece[1] as string]) });
  }

  function squareLabel(square: string): string {
    const piece = pieces.get(square);
    return piece ? `${square}, ${pieceName(piece)}` : square;
  }

  function arrowPath(a: Arrow): { x1: number; y1: number; x2: number; y2: number } {
    const f = cell(a.from);
    const tt = cell(a.to);
    const x1 = f.col + 0.5;
    const y1 = f.row + 0.5;
    const x2 = tt.col + 0.5;
    const y2 = tt.row + 0.5;
    // Stop short of the centre so the head sits on the target square.
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    return { x1, y1, x2: x2 - ((x2 - x1) / len) * 0.3, y2: y2 - ((y2 - y1) / len) * 0.3 };
  }

  /** Slide offset (in squares) for the piece that just arrived, for the move animation. */
  function slide(square: string): string | undefined {
    if (!animate || !lastMove || lastMove[1] !== square || drag) return undefined;
    const from = cell(lastMove[0]);
    const to = cell(square);
    return `--dx:${from.col - to.col};--dy:${from.row - to.row}`;
  }
</script>

<div class="cf-board-wrap">
  <div
    class="cf-board"
    class:dragging={drag?.moved}
    bind:this={boardEl}
    role="group"
    aria-label={label || t('chess.board')}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    onpointercancel={() => (drag = null)}
  >
    {#each squares as square, i (square)}
      {@const piece = pieces.get(square)}
      {@const isTarget = selectedTargets.includes(square)}
      <button
        type="button"
        class="cf-sq"
        class:dark={isDark(square)}
        class:light={!isDark(square)}
        class:last={lastMove !== null && (lastMove[0] === square || lastMove[1] === square)}
        class:sel={selected === square}
        class:hl={highlights.includes(square)}
        class:target={isTarget}
        class:capture={isTarget && piece !== undefined}
        class:movable={canMove(square)}
        data-mark={marks[square]}
        data-square={square}
        aria-label={squareLabel(square)}
        aria-pressed={selected === square}
        tabindex={canMove(square) || isTarget ? 0 : -1}
        onclick={() => onSquareClick(square)}
        onpointerdown={(e) => pointerDown(e, square)}
      >
        {#if piece}
          {#key lastMove?.join('') + square}
            <span class="cf-piece" data-color={piece[0]} class:lifted={drag?.moved && drag.from === square} style={slide(square)} aria-hidden="true">
              <span class="fill">{FILLED[piece[1] as string]}&#xFE0E;</span><span class="line">{OUTLINE[piece[1] as string]}&#xFE0E;</span>
            </span>
          {/key}
        {/if}
        {#if badge && badge.square === square}<span class="cf-sq-badge" style:background={badge.color} title={badge.title} aria-hidden="true">{badge.text}</span>{/if}
        {#if i % 8 === 0}<span class="cf-coord rank" aria-hidden="true">{square[1]}</span>{/if}
        {#if i >= 56}<span class="cf-coord file" aria-hidden="true">{square[0]}</span>{/if}
      </button>
    {/each}

    {#if arrows.length > 0}
      <svg class="cf-arrows" viewBox="0 0 8 8" aria-hidden="true">
        <defs>
          {#each ['hint', 'good', 'bad', 'plan'] as tone (tone)}
            <marker id={'cf-head-' + tone} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" class={'head ' + tone} />
            </marker>
          {/each}
        </defs>
        {#each arrows as a, ai (ai)}
          {@const p = arrowPath(a)}
          <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} class={'shaft ' + (a.tone ?? 'plan')} marker-end={`url(#cf-head-${a.tone ?? 'plan'})`} />
        {/each}
      </svg>
    {/if}

    {#if drag?.moved && boardEl}
      {@const rect = boardEl.getBoundingClientRect()}
      {@const piece = pieces.get(drag.from)}
      {#if piece}
        <span
          class="cf-piece cf-floating"
          data-color={piece[0]}
          style:left={drag.x - rect.left + 'px'}
          style:top={drag.y - rect.top + 'px'}
          style:width={rect.width / 8 + 'px'}
          style:height={rect.width / 8 + 'px'}
          aria-hidden="true"
        >
          <span class="fill">{FILLED[piece[1] as string]}&#xFE0E;</span><span class="line">{OUTLINE[piece[1] as string]}&#xFE0E;</span>
        </span>
      {/if}
    {/if}

    {#if promotion}
      <div class="cf-promo" role="dialog" aria-label={t('chess.promoteTo')}>
        <p>{t('chess.promoteTo')}</p>
        <div class="cf-promo-choices">
          {#each ['q', 'r', 'b', 'n'] as p (p)}
            <button type="button" aria-label={t('chess.' + NAMES[p])} onclick={() => choosePromotion(p)}>
              <span class="cf-piece" data-color={movable ?? 'w'} aria-hidden="true"><span class="fill">{FILLED[p]}&#xFE0E;</span><span class="line">{OUTLINE[p]}&#xFE0E;</span></span>
            </button>
          {/each}
        </div>
        <button type="button" class="link small" onclick={() => (promotion = null)}>{t('common.cancel')}</button>
      </div>
    {/if}
  </div>
</div>
