<script lang="ts">
  // A chess block in a lesson: a worked example to step through (mode "show") or a position to
  // play out against the computer (mode "play"). Puzzles are quiz questions of kind "chess".
  import type { Block, BlockContext } from '../../core/types.ts';
  import { START_FEN, type Color, type PlayGoal, type ShowStep } from '../../core/chess.ts';
  import { renderMarkdown } from '../../core/markdown.ts';
  import ChessShow from '../../ui/chess/ChessShow.svelte';
  import ChessPlay from '../../ui/chess/ChessPlay.svelte';

  let { block, ctx }: { block: Block; ctx: BlockContext } = $props();

  const fen = $derived(typeof block.fen === 'string' ? block.fen : START_FEN);
  const mode = $derived(block.mode === 'play' ? 'play' : 'show');
  const orientation = $derived<Color | undefined>(block.orientation === 'black' ? 'b' : block.orientation === 'white' ? 'w' : undefined);
  const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
</script>

<section class="block chess">
  {#if typeof block.title === 'string'}<h3 class="cf-chess-title">{block.title}</h3>{/if}
  {#if typeof block.prompt === 'string'}<div class="prose">{@html renderMarkdown(block.prompt)}</div>{/if}
  {#if mode === 'play'}
    {#key block.id}
      <ChessPlay
        {fen}
        goal={(block.goal as PlayGoal | undefined) ?? 'free'}
        level={typeof block.level === 'number' ? block.level : 3}
        maxMoves={typeof block.maxMoves === 'number' ? block.maxMoves : undefined}
        learner={orientation}
        celebrations={ctx.celebrations !== false}
        sounds={ctx.sounds === true}
      />
    {/key}
  {:else}
    {#key block.id}
      <ChessShow
        {fen}
        steps={Array.isArray(block.steps) ? (block.steps as ShowStep[]) : []}
        arrows={strings(block.arrows)}
        highlights={strings(block.highlights)}
        caption={typeof block.caption === 'string' ? block.caption : ''}
        {orientation}
      />
    {/key}
  {/if}
</section>
