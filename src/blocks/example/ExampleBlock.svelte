<script lang="ts">
  import type { Block, BlockContext } from '../../core/types.ts';
  import { renderMarkdown } from '../../core/markdown.ts';
  import { resolveCalloutMarkdown } from '../../core/localize.ts';
  import { t } from '../../i18n/i18n.ts';

  let { block, ctx }: { block: Block; ctx: BlockContext } = $props();

  // A worked example: markdown in the block's `markdown`/`i18n[lang].markdown`, shown in its own box.
  const markdown = $derived(resolveCalloutMarkdown(block, ctx.explanationLanguage));
</script>

<section class="block example" lang={ctx.explanationLanguage} data-course={ctx.courseId}>
  <p class="example-label">{t('example.label')}</p>
  <div class="prose">{@html renderMarkdown(markdown)}</div>
</section>
