<script lang="ts">
  // A code question: write code, run it, and check it against the tests. Passing every test
  // answers the question.
  import { onDestroy, untrack } from 'svelte';
  import CodeEditor from './CodeEditor.svelte';
  import { runCode, watchPythonLoading, type CodeLanguage, type RunResult } from './runner.ts';
  import type { CodeTest, Question } from '../../core/types.ts';
  import { t } from '../../i18n/i18n.ts';

  let {
    question,
    done = false,
    showSolution = false,
    onresult
  }: {
    question: Question;
    done?: boolean;
    showSolution?: boolean;
    onresult?: (code: string, passed: boolean) => void;
  } = $props();

  const language = $derived<CodeLanguage>(question.language === 'javascript' ? 'javascript' : 'python');
  const starter = untrack(() => question.starter ?? '');
  const solution = $derived(typeof question.answer === 'string' ? question.answer : '');
  const tests = $derived<CodeTest[]>(question.tests ?? []);

  let code = $state(starter);
  let running = $state<'run' | 'check' | null>(null);
  let result = $state<RunResult | null>(null);
  let checked = $state(false);
  let pyLoading = $state(false);
  const stop = watchPythonLoading((loading) => (pyLoading = loading));
  onDestroy(stop);

  const passed = $derived(result?.tests.filter((r) => r.passed).length ?? 0);

  async function run(withTests: boolean) {
    if (running) return;
    running = withTests ? 'check' : 'run';
    checked = withTests;
    result = await runCode(language, code, withTests ? tests : []);
    running = null;
    if (withTests && result) onresult?.(code, !result.timedOut && result.tests.length > 0 && result.tests.every((r) => r.passed));
  }

  function testLabel(test: CodeTest): string {
    return 'call' in test ? test.call : test.stdin ? t('code.outputWithInput', { input: test.stdin.replace(/\n/g, ' ⏎ ') }) : t('code.output');
  }
</script>

<div class="code-ex">
  <div class="code-head">
    <span class="code-lang">{language === 'python' ? 'Python' : 'JavaScript'}</span>
    {#if !done}<button type="button" class="link small" onclick={() => ((code = starter), (result = null))}>{t('code.reset')}</button>{/if}
  </div>
  <CodeEditor bind:value={code} label={t('code.editorLabel')} readonly={done} />
  <div class="code-actions">
    <button type="button" class="btn" onclick={() => run(false)} disabled={running !== null}>{running === 'run' ? t('code.running') : t('code.run')}</button>
    {#if !done}
      <button type="button" class="btn primary" onclick={() => run(true)} disabled={running !== null || code.trim() === ''}>{running === 'check' ? t('code.checking') : t('code.check')}</button>
    {/if}
    {#if pyLoading && running}<span class="muted small" role="status">{t('code.loadingPython')}</span>{/if}
  </div>

  {#if result}
    <div class="code-result" role="status">
      {#if result.timedOut}
        <p class="code-error">{t('code.timeout')}</p>
      {:else}
        {#if result.output}
          <p class="code-label">{t('code.outputLabel')}</p>
          <pre class="code-out">{result.output}</pre>
        {/if}
        {#if result.error}
          <p class="code-label">{t('code.errorLabel')}</p>
          <pre class="code-out code-error">{result.error}</pre>
        {/if}
        {#if !result.output && !result.error && !checked}<p class="muted small">{t('code.noOutput')}</p>{/if}
      {/if}
      {#if checked && !result.timedOut}
        <p class="code-label">{t('code.testsPassed', { n: passed, total: tests.length })}</p>
        <ul class="code-tests">
          {#each tests as test, i (i)}
            {@const r = result.tests[i]}
            <li class:pass={r?.passed} class:fail={!r?.passed}>
              <span class="code-mark" aria-hidden="true">{r?.passed ? '✓' : '✗'}</span>
              <code>{testLabel(test)}</code>
              {#if r && !r.passed}
                <span class="code-detail">
                  {#if r.error}{t('code.gotError', { error: r.error.split('\n').at(-1) ?? '' })}{:else}{t('code.gotExpected', { got: r.got ?? '', expected: r.expected ?? '' })}{/if}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if showSolution && solution}
    <div class="code-solution">
      <p class="code-label">{t('code.solution')}</p>
      <pre class="code-out">{solution}</pre>
      {#if !done}<button type="button" class="btn" onclick={() => (code = solution)}>{t('code.useSolution')}</button>{/if}
    </div>
  {/if}
</div>
