<script lang="ts">
  import type { Block, BlockContext } from '../../core/types.ts';
  import { renderMarkdown } from '../../core/markdown.ts';
  import { resolveCalloutMarkdown } from '../../core/localize.ts';
  import { t } from '../../i18n/i18n.ts';

  let { block, ctx }: { block: Block; ctx: BlockContext } = $props();

  const STYLES = ['keypoint', 'tip', 'warning', 'note'];
  const style = $derived(typeof block.style === 'string' && STYLES.includes(block.style) ? block.style : 'note');
  const markdown = $derived(resolveCalloutMarkdown(block, ctx.explanationLanguage));
</script>

<aside class="block callout" data-style={style} lang={ctx.explanationLanguage} data-course={ctx.courseId}>
  <p class="callout-label">{t('callout.' + style)}</p>
  <div class="prose">{@html renderMarkdown(markdown)}</div>
</aside>
