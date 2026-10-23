<script lang="ts">
  // A small picture of a position, for lists. Nothing on it can be clicked.
  import type { Color } from '../../core/chess.ts';

  let { fen, orientation = 'w' }: { fen: string; orientation?: Color } = $props();

  const FILLED: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const OUTLINE: Record<string, string> = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };

  const cells = $derived.by(() => {
    const grid: (string | null)[][] = [];
    for (const row of (fen.split(' ')[0] ?? '').split('/')) {
      const r: (string | null)[] = [];
      for (const ch of row) {
        if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i += 1) r.push(null);
        else r.push((ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase());
      }
      grid.push(r);
    }
    const out: { dark: boolean; piece: string | null }[] = [];
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const r = orientation === 'w' ? row : 7 - row;
        const c = orientation === 'w' ? col : 7 - col;
        out.push({ dark: (r + c) % 2 === 1, piece: grid[r]?.[c] ?? null });
      }
    }
    return out;
  });
</script>

<span class="cf-board-wrap cf-mini">
  <span class="cf-board">
    {#each cells as cell, i (i)}
      <span class="cf-sq" class:dark={cell.dark} class:light={!cell.dark}>
        {#if cell.piece}
          <span class="cf-piece" data-color={cell.piece[0]}><span class="fill">{FILLED[cell.piece[1] as string]}&#xFE0E;</span><span class="line">{OUTLINE[cell.piece[1] as string]}&#xFE0E;</span></span>
        {/if}
      </span>
    {/each}
  </span>
</span>
