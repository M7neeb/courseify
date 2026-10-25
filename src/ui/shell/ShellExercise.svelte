<script lang="ts">
  // A shell question: a small fake file tree and a command line. The question is done when the
  // goal is reached (a command was typed, or the tree looks the way the task asks).
  import { tick, untrack } from 'svelte';
  import { createShell, goalMet, runShell, type Fs, type ShellGoal, type ShellState } from '../../core/shell.ts';
  import type { Question } from '../../core/types.ts';
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

  const fresh = (): ShellState => createShell((question.fs ?? {}) as Fs, question.cwd ?? '/home/anna');
  let shell = $state<ShellState>(untrack(fresh));
  let line = $state('');
  let log = $state<{ cwd: string; cmd: string; out: string[] }[]>([]);
  let reached = $state(false);
  let screen = $state<HTMLElement | null>(null);
  const solution = $derived(typeof question.answer === 'string' ? question.answer : '');
  const shortCwd = (cwd: string): string => (cwd === shell.home ? '~' : cwd.startsWith(shell.home + '/') ? '~' + cwd.slice(shell.home.length) : cwd);

  async function run(event?: Event) {
    event?.preventDefault();
    if (done || reached) return;
    const cmd = line;
    line = '';
    const where = shortCwd(shell.cwd);
    const result = runShell(shell, cmd);
    log.push({ cwd: where, cmd, out: result.out });
    if (question.goal && goalMet(question.goal as unknown as ShellGoal, shell)) {
      reached = true;
      onresult?.(shell.history.join('; '), true);
    }
    await tick();
    if (screen) screen.scrollTop = screen.scrollHeight;
  }

  function reset() {
    shell = fresh();
    log = [];
    line = '';
    reached = false;
  }
</script>

<div class="shell-ex">
  <div class="term-screen" bind:this={screen} role="log" aria-label={t('term.screen')}>
    {#each log as h, i (i)}
      <p class="term-line"><span class="term-prompt">anna@pc:{h.cwd}$</span> {h.cmd}</p>
      {#each h.out as o, j (j)}<p class="term-line term-out">{o || ' '}</p>{/each}
    {/each}
    {#if !done && !reached}
      <form class="term-line term-input" onsubmit={run}>
        <span class="term-prompt">anna@pc:{shortCwd(shell.cwd)}$</span>
        <input
          bind:value={line}
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          aria-label={t('term.input')}
        />
      </form>
    {/if}
  </div>
  <div class="code-actions">
    {#if !done && !reached}
      <button type="button" class="btn" onclick={() => run()}>{t('term.run')}</button>
      <button type="button" class="link small" onclick={reset}>{t('shell.reset')}</button>
    {/if}
  </div>
  {#if reached}<p class="drill-right" role="status">{t('shell.reached')}</p>{/if}
  {#if showSolution && solution}
    <div class="code-solution">
      <p class="code-label">{t('shell.solution')}</p>
      <pre class="code-out">{solution}</pre>
    </div>
  {/if}
</div>
