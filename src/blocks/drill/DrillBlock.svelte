<script lang="ts">
  // A short set of generated practice problems inside a lesson.
  // { "type": "drill", "drill": "subnet-network", "level": 2, "count": 5, "title"? }
  import type { Block, BlockContext } from '../../core/types.ts';
  import { drillById, type Level } from '../../core/drills.ts';
  import DrillRunner from '../../ui/drills/DrillRunner.svelte';
  import { tIn } from '../../i18n/i18n.ts';

  let { block, ctx }: { block: Block; ctx: BlockContext } = $props();

  const lang = $derived(ctx.explanationLanguage);
  const def = $derived(typeof block.drill === 'string' ? drillById(block.drill) : undefined);
  const level = $derived<Level>(block.level === 2 || block.level === 3 ? block.level : 1);
  const count = $derived(Number.isInteger(block.count) ? Math.min(30, Math.max(1, block.count as number)) : 5);
  const localized = $derived((block.i18n?.[lang] ?? {}) as { title?: string });
  const title = $derived(localized.title ?? (typeof block.title === 'string' ? block.title : def ? tIn(lang, `drill.${def.id}.name`) : ''));
</script>

<section class="block drill-block" lang={lang} data-course={ctx.courseId}>
  {#if def}
    <div class="drill-head">
      <span class="drill-tag">{tIn(lang, 'drill.tag')}</span>
      <h3 class="drill-title">{title}</h3>
    </div>
    <DrillRunner drill={def.id} {level} {count} {lang} sounds={ctx.sounds} />
  {:else}
    <p class="muted">{tIn(lang, 'drill.unknown', { id: String(block.drill) })}</p>
  {/if}
</section>
