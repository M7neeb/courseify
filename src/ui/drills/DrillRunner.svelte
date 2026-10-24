<script lang="ts">
  // One drill session: a generated problem, an answer field, steps to reveal one by one, and the
  // next problem. A set of `count` problems ends with a short result; without a count it never ends.
  import { tick, untrack } from 'svelte';
  import { checkDrillAnswer, makeProblem, type DrillProblem, type Level, type Line } from '../../core/drills.ts';
  import { renderMarkdown, renderTex } from '../../core/markdown.ts';
  import { recordActivity } from '../../core/state.svelte.ts';
  import { playCorrect, playWrong } from '../sound.ts';
  import { tIn } from '../../i18n/i18n.ts';

  let {
    drill,
    level,
    count = null,
    lang,
    sounds = false,
    onResult
  }: {
    drill: string;
    level: Level;
    /** Problems in the set; null keeps going. */
    count?: number | null;
    lang: string;
    sounds?: boolean;
    /** Each finished problem: right first time, and solved at all (without the full solution). */
    onResult?: (r: { firstTry: boolean; solved: boolean }) => void;
  } = $props();

  const tr = (key: string, vars: Record<string, string | number> = {}) => tIn(lang, key, vars);

  let problem = $state<DrillProblem | null>(untrack(() => makeProblem(drill, level)));
  let given = $state('');
  let phase = $state<'asking' | 'wrong' | 'right' | 'shown'>('asking');
  let tries = $state(0);
  let stepsShown = $state(0);
  let done = $state(0);
  let firstTries = $state(0);
  let input = $state<HTMLInputElement | null>(null);
  let nextBtn = $state<HTMLButtonElement | null>(null);

  /** The set's result shows once the last problem is put away. */
  let finished = $state(false);
  const allSteps = $derived(phase === 'shown' || phase === 'right');
  /** A step is one sentence with the formulas and bits under it. */
  const stepGroups = $derived.by(() => {
    const groups: Line[][] = [];
    for (const line of problem?.steps ?? []) {
      if ('k' in line || groups.length === 0) groups.push([line]);
      else groups[groups.length - 1].push(line);
    }
    return groups;
  });
  const visibleSteps = $derived(allSteps ? stepGroups : stepGroups.slice(0, stepsShown));

  const PLACEHOLDER: Record<DrillProblem['type'], string> = {
    int: 'drill.ph.number',
    number: 'drill.ph.number',
    bin: 'drill.ph.bin',
    hex: 'drill.ph.hex',
    ip: 'drill.ph.ip',
    fraction: 'drill.ph.fraction',
    set: 'drill.ph.set',
    ipv6: 'drill.ph.ipv6',
    ipv6short: 'drill.ph.ipv6',
    ipv6full: 'drill.ph.ipv6full'
  };

  function lineHtml(line: Line): string {
    if ('tex' in line) return renderTex(line.tex, true);
    if ('mono' in line) return '';
    return renderMarkdown(tr(line.k, line.v));
  }

  function check(event?: Event) {
    event?.preventDefault();
    if (!problem || !given.trim() || phase === 'right' || phase === 'shown') return;
    tries++;
    if (checkDrillAnswer(problem, given)) {
      phase = 'right';
      const firstTry = tries === 1 && stepsShown === 0;
      if (firstTry) firstTries++;
      done++;
      if (sounds) playCorrect();
      void recordActivity('correct');
      onResult?.({ firstTry, solved: true });
      void tick().then(() => nextBtn?.focus());
    } else {
      phase = 'wrong';
      if (sounds) playWrong();
    }
  }

  function showStep() {
    if (!problem) return;
    stepsShown = Math.min(stepGroups.length, stepsShown + 1);
  }

  function showSolution() {
    if (!problem || phase === 'right' || phase === 'shown') return;
    phase = 'shown';
    done++;
    onResult?.({ firstTry: false, solved: false });
    void tick().then(() => nextBtn?.focus());
  }

  async function next() {
    if (count !== null && done >= count) {
      finished = true;
      return;
    }
    problem = makeProblem(drill, level);
    given = '';
    phase = 'asking';
    tries = 0;
    stepsShown = 0;
    await tick();
    input?.focus();
  }

  function again() {
    finished = false;
    done = 0;
    firstTries = 0;
    void next();
  }

  // A new drill or level starts over.
  let started = '';
  $effect(() => {
    const key = `${drill}:${level}`;
    if (started && started !== key) untrack(() => again());
    started = key;
  });
</script>

{#if finished}
  <div class="drill-done" role="status">
    <p class="drill-done-score">{tr('drill.setResult', { right: firstTries, total: count ?? 0 })}</p>
    <div class="drill-actions">
      <button type="button" class="btn" onclick={again}>{tr('drill.again')}</button>
      <a class="btn secondary" href={`#/drills/${drill}`}>{tr('drill.moreInDrills')}</a>
    </div>
  </div>
{:else if problem}
  <div class="drill-card" data-state={phase}>
    {#if count !== null}<p class="drill-count muted small">{tr('drill.progress', { n: done + 1, total: count })}</p>{/if}
    <div class="drill-prompt">
      {#each problem.prompt as line, i (i)}
        {#if 'mono' in line}<p class="drill-mono">{line.mono}</p>{:else}<div class="drill-line">{@html lineHtml(line)}</div>{/if}
      {/each}
    </div>

    <form class="drill-form" onsubmit={check}>
      <label class="drill-answer">
        <span class="sr-only">{tr('drill.answer')}</span>
        <input
          bind:this={input}
          bind:value={given}
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-label={tr('drill.answer')}
          placeholder={tr(PLACEHOLDER[problem.type])}
          readonly={phase === 'right' || phase === 'shown'}
          oninput={() => {
            if (phase === 'wrong') phase = 'asking';
          }}
        />
        {#if problem.unit}<span class="drill-unit">{problem.unit}</span>{/if}
      </label>
      {#if phase === 'right' || phase === 'shown'}
        <button type="button" class="btn" bind:this={nextBtn} onclick={next}>{done >= (count ?? Infinity) ? tr('drill.seeResult') : tr('drill.next')}</button>
      {:else}
        <button type="submit" class="btn" disabled={!given.trim()}>{tr('drill.check')}</button>
      {/if}
    </form>

    <div class="drill-feedback" role="status" aria-live="polite">
      {#if phase === 'right'}
        <p class="drill-right">{tries === 1 && stepsShown === 0 ? tr('drill.right') : tr('drill.rightAfter')}</p>
      {:else if phase === 'wrong'}
        <p class="drill-wrong">{tr('drill.wrong')}</p>
      {:else if phase === 'shown'}
        <p class="drill-answer-shown">{tr('drill.answerIs')} <strong>{problem.answer}{problem.unit ? ` ${problem.unit}` : ''}</strong></p>
      {/if}
    </div>

    {#if phase !== 'right' && phase !== 'shown'}
      <div class="drill-actions">
        {#if stepsShown < stepGroups.length}
          <button type="button" class="link" onclick={showStep}>{stepsShown === 0 ? tr('drill.firstStep') : tr('drill.nextStep')}</button>
        {/if}
        <button type="button" class="link" onclick={showSolution}>{tr('drill.showSolution')}</button>
      </div>
    {/if}

    {#if visibleSteps.length}
      <ol class="drill-steps" aria-label={tr('drill.steps')}>
        {#each visibleSteps as group, i (i)}
          <li>
            {#each group as line, j (j)}
              {#if 'mono' in line}<p class="drill-mono">{line.mono}</p>{:else}<div class="drill-line" class:tex={'tex' in line}>{@html lineHtml(line)}</div>{/if}
            {/each}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
{/if}
