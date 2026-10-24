<script lang="ts">
  import type { Block, BlockContext } from '../../core/types.ts';
  import { renderMarkdown } from '../../core/markdown.ts';
  import { resolveCalloutMarkdown } from '../../core/localize.ts';
  import { tierForPoints } from '../../core/mastery.ts';
  import { hiddenSteps, splitWorked } from '../../core/worked.ts';
  import { t } from '../../i18n/i18n.ts';

  let { block, ctx }: { block: Block; ctx: BlockContext } = $props();

  // A worked example: markdown in the block's `markdown`/`i18n[lang].markdown`, shown in its own box.
  // A numbered solution fades as the lesson's skill grows: the last steps wait behind a tap, so the
  // learner works them out first. Once the skill is Mastered the example is whole again.
  const markdown = $derived(resolveCalloutMarkdown(block, ctx.explanationLanguage));
  const split = $derived(ctx.itemKind === 'lesson' ? splitWorked(markdown) : null);
  const points = $derived(ctx.getSkillPoints?.(ctx.lessonId) ?? ctx.getSkillMastery(ctx.lessonId)?.points ?? 0);
  const hidden = $derived(split ? hiddenSteps(split.steps.length, tierForPoints(points)) : 0);
  let shown = $state<number[]>([]);
  const isHidden = (i: number): boolean => split !== null && i >= split.steps.length - hidden && !shown.includes(i);
</script>

<section class="block example" lang={ctx.explanationLanguage} data-course={ctx.courseId}>
  <p class="example-label">{t('example.label')}</p>
  {#if split && hidden > 0}
    <div class="prose">
      {@html renderMarkdown(split.before)}
      {#each split.steps as step, i (i)}
        {#if isHidden(i)}
          <button type="button" class="example-fade" onclick={() => (shown = [...shown, i])}>
            {t('example.tryStep', { n: i + 1 })}
          </button>
        {:else}
          {@html renderMarkdown(step)}
        {/if}
      {/each}
      {@html renderMarkdown(split.after)}
    </div>
    <p class="muted small example-fade-note">{t('example.fadeNote')}</p>
  {:else}
    <div class="prose">{@html renderMarkdown(markdown)}</div>
  {/if}
</section>
