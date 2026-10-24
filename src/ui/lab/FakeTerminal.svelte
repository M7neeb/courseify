<script lang="ts">
  // A narrow fake terminal: one task at a time, only the command that task needs works.
  import { tick } from 'svelte';
  import { NET_TERMINAL_TASKS } from '../../core/labData.ts';
  import { recordActivity } from '../../core/state.svelte.ts';
  import { playCorrect, playWrong } from '../sound.ts';
  import { tIn } from '../../i18n/i18n.ts';

  let {
    lang,
    sounds = false,
    onResult
  }: {
    lang: string;
    sounds?: boolean;
    onResult?: (r: { firstTry: boolean; solved: boolean }) => void;
  } = $props();

  const tr = (key: string, vars: Record<string, string | number> = {}) => tIn(lang, key, vars);

  let taskIndex = $state(0);
  const task = $derived(NET_TERMINAL_TASKS[taskIndex]);
  let line = $state('');
  let history = $state<{ cmd: string; out: string[] }[]>([]);
  let solved = $state(false);
  let tries = $state(0);
  let hintShown = $state(false);
  let finished = $state(false);
  let firstTries = $state(0);
  let input = $state<HTMLInputElement | null>(null);
  let screen = $state<HTMLElement | null>(null);

  async function run(event?: Event) {
    event?.preventDefault();
    if (solved) return;
    const cmd = line;
    line = '';
    const res = task.exec(cmd);
    history.push({ cmd, out: res.out });
    if (cmd.trim()) tries++;
    if (res.done) {
      solved = true;
      const first = tries === 1 && !hintShown;
      if (first) firstTries++;
      if (sounds) playCorrect();
      void recordActivity('correct');
      onResult?.({ firstTry: first, solved: true });
    } else if (cmd.trim() && sounds) playWrong();
    await tick();
    if (screen) screen.scrollTop = screen.scrollHeight;
  }

  function reset() {
    history = [];
    line = '';
    solved = false;
    tries = 0;
    hintShown = false;
    void tick().then(() => input?.focus());
  }

  function next() {
    if (taskIndex + 1 >= NET_TERMINAL_TASKS.length) {
      finished = true;
      return;
    }
    taskIndex++;
    reset();
  }

  function again() {
    finished = false;
    taskIndex = 0;
    firstTries = 0;
    reset();
  }
</script>

<div class="lab-terminal">
  {#if finished}
    <div class="drill-done" role="status">
      <p class="drill-done-score">{tr('drill.setResult', { right: firstTries, total: NET_TERMINAL_TASKS.length })}</p>
      <div class="drill-actions"><button type="button" class="btn" onclick={again}>{tr('drill.again')}</button></div>
    </div>
  {:else}
    <div class="drill-card" data-state={solved ? 'right' : 'asking'}>
      <p class="drill-count muted small">{tr('term.of', { n: taskIndex + 1, total: NET_TERMINAL_TASKS.length })}</p>
      <p class="drill-prompt">{tr(`term.task.${task.id}`)}</p>

      <div class="term-screen" bind:this={screen} role="log" aria-label={tr('term.screen')}>
        {#each history as h, i (i)}
          <p class="term-line"><span class="term-prompt">{task.prompt}</span> {h.cmd}</p>
          {#each h.out as o, j (j)}<p class="term-line term-out">{o || ' '}</p>{/each}
        {/each}
        {#if !solved}
          <form class="term-line term-input" onsubmit={run}>
            <span class="term-prompt">{task.prompt}</span>
            <input
              bind:this={input}
              bind:value={line}
              type="text"
              inputmode="text"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              aria-label={tr('term.input')}
            />
          </form>
        {/if}
      </div>

      {#if solved}
        <p class="drill-right">{tr(`term.done.${task.id}`)}</p>
        <div class="drill-form"><button type="button" class="btn" onclick={next}>{taskIndex + 1 >= NET_TERMINAL_TASKS.length ? tr('drill.seeResult') : tr('drill.next')}</button></div>
      {:else}
        <div class="drill-actions">
          <button type="button" class="btn" onclick={() => run()}>{tr('term.run')}</button>
          <button type="button" class="link" onclick={() => (hintShown = true)}>{tr('term.showHint')}</button>
        </div>
        {#if hintShown}<p class="muted">{tr(`term.hint.${task.id}`)}</p>{/if}
      {/if}
    </div>
  {/if}
</div>
