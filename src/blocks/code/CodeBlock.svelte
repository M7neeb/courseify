<script lang="ts">
  // A runnable code example in a lesson: read it, run it, change it and run it again.
  // { "type": "code", "language": "python" | "javascript", "code": "...", "title"?, "caption"? }
  import { untrack } from 'svelte';
  import type { Block, BlockContext } from '../../core/types.ts';
  import CodeEditor from '../../ui/code/CodeEditor.svelte';
  import { runCode, type CodeLanguage, type RunResult } from '../../ui/code/runner.ts';
  import { renderMarkdown } from '../../core/markdown.ts';
  import { t } from '../../i18n/i18n.ts';

  let { block, ctx }: { block: Block; ctx: BlockContext } = $props();

  const original = untrack(() => (Array.isArray(block.code) ? (block.code as string[]).join('\n') : String(block.code ?? '')));
  const language = $derived<CodeLanguage>(block.language === 'javascript' ? 'javascript' : 'python');
  const localized = $derived((block.i18n?.[ctx.explanationLanguage] ?? {}) as { caption?: string; title?: string });
  const title = $derived(localized.title ?? (typeof block.title === 'string' ? block.title : ''));
  const caption = $derived(localized.caption ?? (typeof block.caption === 'string' ? block.caption : ''));

  let code = $state(original);
  let running = $state(false);
  let result = $state<RunResult | null>(null);

  async function run() {
    running = true;
    result = await runCode(language, code);
    running = false;
  }
</script>

<section class="block code-block" lang={ctx.explanationLanguage} data-course={ctx.courseId}>
  <div class="code-head">
    <span class="code-lang">{language === 'python' ? 'Python' : 'JavaScript'}</span>
    {#if title}<span class="code-title">{title}</span>{/if}
    {#if code !== original}<button type="button" class="link small" onclick={() => ((code = original), (result = null))}>{t('code.reset')}</button>{/if}
  </div>
  <CodeEditor bind:value={code} label={title || t('code.editorLabel')} />
  <div class="code-actions">
    <button type="button" class="btn" onclick={run} disabled={running}>{running ? t('code.running') : t('code.run')}</button>
    <span class="muted small">{t('code.tryChanging')}</span>
  </div>
  {#if result}
    <div class="code-result" role="status">
      {#if result.timedOut}
        <p class="code-error">{t('code.timeout')}</p>
      {:else}
        {#if result.output}<pre class="code-out">{result.output}</pre>{/if}
        {#if result.error}<pre class="code-out code-error">{result.error}</pre>{/if}
        {#if !result.output && !result.error}<p class="muted small">{t('code.noOutput')}</p>{/if}
      {/if}
    </div>
  {/if}
  {#if caption}<div class="prose code-caption">{@html renderMarkdown(caption)}</div>{/if}
</section>
