<script lang="ts">
  // A chessboard: shows a position and lets one side move by dragging or by tapping a piece and
  // then a square. It knows no rules itself: the parent passes the legal targets and decides what
  // a move does. Squares are buttons, so the board also works with a keyboard and screen reader.
  //
  // Like on chess.com you can draw on it: right-click a square to colour it, right-drag from one
  // square to another for an arrow (Shift green, Ctrl red, Alt blue). A left click clears the
  // drawing. With `annotate` on, a long press does the same on a touch screen.
  import { untrack } from 'svelte';
  import { t } from '../../i18n/i18n.ts';
  import { chessPrefs } from './prefs.svelte.ts';

  import type { BoardArrow as Arrow, Color } from '../../core/chess.ts';

  type Tone = 'plan' | 'hint' | 'good' | 'bad';

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
    annotate = false,
    premove = false,
    onmove,
    onemptyclick
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
    /** Squares coloured to show a result: 'good' (right move), 'bad' (wrong), 'hint', 'premove'. */
    marks?: Record<string, 'good' | 'bad' | 'hint' | 'premove'>;
    animate?: boolean;
    label?: string;
    /** A small round mark on one square, such as a move's review class ("??" on red). */
    badge?: { square: string; text: string; color: string; title?: string } | null;
    /** Drawing by long press on touch screens (the board then no longer scrolls the page). */
    annotate?: boolean;
    /** The movable side may pick up pieces although it is not its turn (a premove). */
    premove?: boolean;
    onmove?: (from: string, to: string, promotion?: string) => void;
    /** A click that neither picked up a piece nor made a move. */
    onemptyclick?: () => void;
  } = $props();

  const FILES = 'abcdefgh';
  const FILLED: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const OUTLINE: Record<string, string> = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };
  const NAMES: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
  const TONES: Tone[] = ['hint', 'good', 'bad', 'plan'];
  const uid = Math.random().toString(36).slice(2, 8);

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
  // `drag` changes only when a drag starts or ends; the floating piece's position lives apart in
  // `dragAt`, updated once per frame, so moving the pointer does not re-render the 64 squares.
  let drag = $state<{ from: string; x: number; y: number; moved: boolean } | null>(null);
  let dragAt = $state({ x: 0, y: 0 });
  let dragBox = $state({ left: 0, top: 0, size: 0 });
  let frame = 0;
  let nextAt = { x: 0, y: 0 };
  let promotion = $state<{ from: string; to: string } | null>(null);
  let boardEl: HTMLDivElement | undefined = $state();

  // The learner's own drawing: arrows and coloured squares.
  let userArrows = $state<Arrow[]>([]);
  let userMarks = $state<Record<string, Tone>>({});
  let drawing = $state<{ from: string; to: string; tone: Tone } | null>(null);
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressAt = { x: 0, y: 0 };
  /** The square a piece was just dropped on: it is already there, so it does not slide in. */
  let droppedOn: string | null = null;

  const selectedTargets = $derived(selected ? (targets.get(selected) ?? []) : []);

  // A new position (a reply, a reset) clears the drawing and any half-made move, but a piece you
  // picked up while the other side was thinking stays in your hand.
  $effect(() => {
    void fen;
    const keep = untrack(() => selected !== null && movable !== null && pieces.get(selected)?.[0] === movable);
    if (!keep) selected = null;
    untrack(() => {
      if (lastMove?.[1] !== droppedOn) droppedOn = null;
      // A piece in your hand that the other side just took is gone.
      if (drag && pieces.get(drag.from)?.[0] !== movable) {
        drag = null;
        cancelAnimationFrame(frame);
        frame = 0;
      }
      // A premove waiting for its promotion piece keeps its picker.
      if (!(premove && promotion && pieces.get(promotion.from)?.[0] === movable)) promotion = null;
    });
    userArrows = [];
    userMarks = {};
  });

  function canMove(square: string): boolean {
    const piece = pieces.get(square);
    return movable !== null && (premove || movable === turn) && piece !== undefined && piece[0] === movable && (targets.get(square)?.length ?? 0) > 0;
  }

  function attempt(from: string, to: string) {
    if (!(targets.get(from) ?? []).includes(to)) return false;
    const piece = pieces.get(from);
    if (piece?.[1] === 'p' && (to[1] === '8' || to[1] === '1')) {
      if (chessPrefs.autoQueen) {
        selected = null;
        onmove?.(from, to, 'q');
        return true;
      }
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
    const next = canMove(square) && selected !== square ? square : null;
    if (!next && !selected) onemptyclick?.();
    selected = next;
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

  function toneFor(event: PointerEvent): Tone {
    if (event.shiftKey) return 'good';
    if (event.ctrlKey || event.metaKey) return 'bad';
    if (event.altKey) return 'hint';
    return 'plan';
  }

  function startDrawing(event: PointerEvent, square: string, tone: Tone) {
    drag = null;
    selected = null;
    drawing = { from: square, to: square, tone };
    try {
      boardEl?.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer is gone already */
    }
  }

  function finishDrawing() {
    if (!drawing) return;
    const { from, to, tone } = drawing;
    drawing = null;
    if (from === to) {
      const next = { ...userMarks };
      if (next[from] === tone) delete next[from];
      else next[from] = tone;
      userMarks = next;
      return;
    }
    const i = userArrows.findIndex((a) => a.from === from && a.to === to);
    if (i >= 0 && userArrows[i]?.tone === tone) userArrows = userArrows.filter((_, j) => j !== i);
    else userArrows = [...userArrows.filter((_, j) => j !== i), { from, to, tone }];
  }

  // A drag starts after the pointer moves a few pixels; a plain tap is left to the click handler.
  let suppressClick = false;

  function boardPointerDown(event: PointerEvent) {
    const square = squareAt(event.clientX, event.clientY);
    if (!square) return;
    if (event.button === 2) {
      event.preventDefault();
      startDrawing(event, square, toneFor(event));
      return;
    }
    if (event.button !== 0) return;
    // A left click wipes the drawing, as on chess.com.
    if (userArrows.length > 0 || Object.keys(userMarks).length > 0) {
      userArrows = [];
      userMarks = {};
    }
    if (annotate && event.pointerType !== 'mouse' && !canMove(square)) {
      clearTimeout(pressTimer);
      pressAt = { x: event.clientX, y: event.clientY };
      pressTimer = setTimeout(() => {
        if (drag) return;
        navigator.vibrate?.(12);
        suppressClick = true;
        startDrawing(event, square, 'plan');
      }, 420);
    }
  }

  function pointerDown(event: PointerEvent, square: string) {
    suppressClick = false;
    if (promotion || event.button !== 0 || !canMove(square)) return;
    drag = { from: square, x: event.clientX, y: event.clientY, moved: false };
  }

  function pointerMove(event: PointerEvent) {
    if (drawing) {
      const to = squareAt(event.clientX, event.clientY);
      if (to && to !== drawing.to) drawing = { ...drawing, to };
      return;
    }
    if (!drag) {
      if (pressTimer && event.pointerType !== 'mouse' && Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) > 8) clearTimeout(pressTimer);
      return;
    }
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 6) return;
      clearTimeout(pressTimer);
      boardEl?.setPointerCapture(event.pointerId);
      const rect = boardEl?.getBoundingClientRect();
      if (rect) dragBox = { left: rect.left, top: rect.top, size: rect.width / 8 };
      dragAt = { x: event.clientX - dragBox.left, y: event.clientY - dragBox.top };
      selected = drag.from;
      drag = { ...drag, moved: true };
      return;
    }
    nextAt = { x: event.clientX - dragBox.left, y: event.clientY - dragBox.top };
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        dragAt = nextAt;
      });
    }
  }

  function pointerUp(event: PointerEvent) {
    clearTimeout(pressTimer);
    if (drawing) {
      finishDrawing();
      return;
    }
    if (!drag) return;
    const { from, moved } = drag;
    drag = null;
    cancelAnimationFrame(frame);
    frame = 0;
    if (!moved) return;
    suppressClick = true;
    const to = squareAt(event.clientX, event.clientY);
    if (to && to !== from) {
      droppedOn = to;
      if (attempt(from, to)) return;
    }
    droppedOn = null;
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

  /** The arrow's path in board units. A knight jump bends like an L, long leg first. */
  function arrowPath(a: Arrow): string {
    const f = cell(a.from);
    const tt = cell(a.to);
    const x1 = f.col + 0.5;
    const y1 = f.row + 0.5;
    const x2 = tt.col + 0.5;
    const y2 = tt.row + 0.5;
    const dx = Math.abs(tt.col - f.col);
    const dy = Math.abs(tt.row - f.row);
    const knight = (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
    if (knight) {
      const cx = dy === 2 ? x1 : x2;
      const cy = dy === 2 ? y2 : y1;
      const len = Math.hypot(x2 - cx, y2 - cy) || 1;
      const ex = x2 - ((x2 - cx) / len) * 0.3;
      const ey = y2 - ((y2 - cy) / len) * 0.3;
      return `M${x1} ${y1} L${cx} ${cy} L${ex} ${ey}`;
    }
    // Stop short of the centre so the head sits on the target square.
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    return `M${x1} ${y1} L${x2 - ((x2 - x1) / len) * 0.3} ${y2 - ((y2 - y1) / len) * 0.3}`;
  }

  const shownArrows = $derived<(Arrow & { user?: boolean; ghost?: boolean })[]>([
    ...arrows,
    ...userArrows.map((a) => ({ ...a, user: true })),
    ...(drawing && drawing.from !== drawing.to ? [{ from: drawing.from, to: drawing.to, tone: drawing.tone, ghost: true }] : [])
  ]);

  function focusFirst(node: HTMLElement, on: boolean) {
    if (on) node.focus({ preventScroll: true });
  }

  /** Slide offset (in squares) for the piece that just arrived, for the move animation. */
  function slide(square: string): string | undefined {
    if (!animate || !chessPrefs.animate || !lastMove || lastMove[1] !== square || droppedOn === square) return undefined;
    const from = cell(lastMove[0]);
    const to = cell(square);
    return `--dx:${from.col - to.col};--dy:${from.row - to.row}`;
  }
</script>

<div class="cf-board-wrap" data-board-theme={chessPrefs.theme} class:no-dots={!chessPrefs.legal}>
  <div
    class="cf-board"
    class:dragging={drag?.moved}
    class:annotate
    bind:this={boardEl}
    role="group"
    aria-label={label || t('chess.board')}
    onpointerdown={boardPointerDown}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    onpointercancel={() => {
      clearTimeout(pressTimer);
      cancelAnimationFrame(frame);
      frame = 0;
      drag = null;
      drawing = null;
    }}
    oncontextmenu={(e) => e.preventDefault()}
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
        data-user={userMarks[square]}
        data-square={square}
        aria-label={squareLabel(square)}
        aria-pressed={selected === square}
        tabindex={canMove(square) || isTarget ? 0 : -1}
        onclick={() => onSquareClick(square)}
        onpointerdown={(e) => pointerDown(e, square)}
      >
        {#if piece}
          {#key square === lastMove?.[1] ? lastMove.join('') : ''}
            <span class="cf-piece" data-color={piece[0]} class:lifted={drag?.moved && drag.from === square} style={slide(square)} aria-hidden="true">
              <span class="fill">{FILLED[piece[1] as string]}&#xFE0E;</span><span class="line">{OUTLINE[piece[1] as string]}&#xFE0E;</span>
            </span>
          {/key}
        {/if}
        {#if badge && badge.square === square}<span class="cf-sq-badge" style:background={badge.color} title={badge.title} aria-hidden="true">{badge.text}</span>{/if}
        {#if chessPrefs.coords && i % 8 === 0}<span class="cf-coord rank" aria-hidden="true">{square[1]}</span>{/if}
        {#if chessPrefs.coords && i >= 56}<span class="cf-coord file" aria-hidden="true">{square[0]}</span>{/if}
      </button>
    {/each}

    {#if shownArrows.length > 0}
      <svg class="cf-arrows" viewBox="0 0 8 8" aria-hidden="true">
        <defs>
          {#each TONES as tone (tone)}
            <marker id={`cf-head-${uid}-${tone}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" class={'head ' + tone} />
            </marker>
          {/each}
        </defs>
        {#each shownArrows as a, ai (ai)}
          <path d={arrowPath(a)} class={'shaft ' + (a.tone ?? 'plan')} class:user={a.user} class:ghost={a.ghost} marker-end={`url(#cf-head-${uid}-${a.tone ?? 'plan'})`} />
        {/each}
      </svg>
    {/if}

    {#if drag?.moved}
      {@const piece = pieces.get(drag.from)}
      {#if piece}
        <span
          class="cf-piece cf-floating"
          data-color={piece[0]}
          style:transform={`translate3d(${dragAt.x - dragBox.size / 2}px, ${dragAt.y - dragBox.size / 2}px, 0) scale(1.12)`}
          style:width={dragBox.size + 'px'}
          style:height={dragBox.size + 'px'}
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
            <button type="button" use:focusFirst={p === 'q'} aria-label={t('chess.' + NAMES[p])} onclick={() => choosePromotion(p)}>
              <span class="cf-piece" data-color={movable ?? 'w'} aria-hidden="true"><span class="fill">{FILLED[p]}&#xFE0E;</span><span class="line">{OUTLINE[p]}&#xFE0E;</span></span>
            </button>
          {/each}
        </div>
        <button type="button" class="link small" onclick={() => (promotion = null)}>{t('common.cancel')}</button>
      </div>
    {/if}
  </div>
</div>
