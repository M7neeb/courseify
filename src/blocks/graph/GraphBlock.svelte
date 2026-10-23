<script lang="ts">
  // A graph in a lesson: functions of x with sliders for their parameters.
  // { "type": "graph", "title"?, "functions": [{ "expr": "a*x^2 + b", "label"? }], "params"?: [...],
  //   "x"?: [-10, 10], "y"?: [-10, 10], "points"?: [[x, y]], "caption"?, "i18n"?: { "de": { "title", "caption" } } }
  import type { Block, BlockContext } from '../../core/types.ts';
  import { readGraph } from '../../core/graph.ts';
  import { renderMarkdown } from '../../core/markdown.ts';
  import GraphView from '../../ui/graph/GraphView.svelte';
  import { tIn } from '../../i18n/i18n.ts';

  let { block, ctx }: { block: Block; ctx: BlockContext } = $props();

  const spec = $derived(readGraph(block));
  const localized = $derived((block.i18n?.[ctx.explanationLanguage] ?? {}) as { title?: string; caption?: string });
  const title = $derived(localized.title ?? (typeof block.title === 'string' ? block.title : ''));
  const caption = $derived(localized.caption ?? (typeof block.caption === 'string' ? block.caption : ''));
</script>

<section class="block graph-block" lang={ctx.explanationLanguage} data-course={ctx.courseId}>
  {#if title}<h3 class="graph-title">{title}</h3>{/if}
  {#if spec.functions.length}
    <GraphView functions={spec.functions} params={spec.params} x={spec.x} y={spec.y} points={spec.points} lang={ctx.explanationLanguage} />
  {:else}
    <p class="muted">{tIn(ctx.explanationLanguage, 'graph.broken')}</p>
  {/if}
  {#if caption}<div class="prose graph-caption">{@html renderMarkdown(caption)}</div>{/if}
</section>
