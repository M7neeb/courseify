<script lang="ts">
  import type { Block, BlockContext, ExplanationLevel } from '../../core/types.ts';
  import { renderMarkdown } from '../../core/markdown.ts';
  import { resolveTextLevels } from '../../core/localize.ts';
  import { t } from '../../i18n/i18n.ts';

  let { block, ctx }: { block: Block; ctx: BlockContext } = $props();

  const ORDER: ExplanationLevel[] = ['normal', 'simple', 'detailed'];

  // Levels are resolved for the chosen explanation language (i18n first, legacy levels as fallback).
  const levels = $derived(resolveTextLevels(block, ctx.explanationLanguage));
  const available = $derived(ORDER.filter((l) => levels[l] !== undefined));
  let chosen = $state<ExplanationLevel | null>(null);
  const level = $derived<ExplanationLevel>(
    chosen && levels[chosen] ? chosen : levels[ctx.explanationLevel] ? ctx.explanationLevel : 'normal'
  );
</script>

<section class="block text" lang={ctx.explanationLanguage} data-course={ctx.courseId}>
  {#if available.length > 1}
    <div class="level-switch" role="group" aria-label={t('text.level')}>
      {#each available as l (l)}
        <button type="button" class:active={l === level} aria-pressed={l === level} onclick={() => (chosen = l)}>
          {t('level.' + l)}
        </button>
      {/each}
    </div>
  {/if}
  <div class="prose">{@html renderMarkdown(levels[level] ?? '')}</div>
</section>
