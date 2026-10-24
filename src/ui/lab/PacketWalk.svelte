<script lang="ts">
  // Packet walk-through: what does the PC send (or receive) next? Guess first, then see the packet.
  import { WALK_SCENARIOS, walkChoice, type WalkChoice } from '../../core/labData.ts';
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

  let scenarioId = $state(WALK_SCENARIOS[0].id);
  const scenario = $derived(WALK_SCENARIOS.find((s) => s.id === scenarioId)!);
  let index = $state(0);
  let choice = $state<WalkChoice>(walkChoice(WALK_SCENARIOS[0], 0));
  let wrong = $state<number[]>([]);
  let revealed = $state(false);
  let firstTries = $state(0);
  let finished = $state(false);

  const done = $derived(scenario.steps.slice(0, finished ? scenario.steps.length : index));

  function startStep(i: number) {
    index = i;
    choice = walkChoice(scenario, i);
    wrong = [];
    revealed = false;
  }

  function pickScenario(id: string) {
    if (id === scenarioId) return;
    scenarioId = id;
    firstTries = 0;
    finished = false;
    startStep(0);
  }

  function guess(i: number) {
    if (revealed || wrong.includes(i)) return;
    if (i === choice.correct) {
      revealed = true;
      const first = wrong.length === 0;
      if (first) firstTries++;
      if (sounds) playCorrect();
      void recordActivity('correct');
      onResult?.({ firstTry: first, solved: true });
    } else {
      wrong = [...wrong, i];
      if (sounds) playWrong();
    }
  }

  function next() {
    if (index + 1 >= scenario.steps.length) {
      finished = true;
      return;
    }
    startStep(index + 1);
  }

  function again() {
    finished = false;
    firstTries = 0;
    startStep(0);
  }
</script>

<div class="lab-walk">
  <div class="cf-segmented" role="group" aria-label={tr('walk.scenarios')}>
    {#each WALK_SCENARIOS as s (s.id)}
      <button type="button" aria-pressed={scenarioId === s.id} onclick={() => pickScenario(s.id)}>{tr(`walk.title.${s.id}`)}</button>
    {/each}
  </div>
  <p class="muted">{tr(`walk.intro.${scenarioId}`)}</p>

  {#if done.length}
    <ol class="lab-timeline" aria-label={tr('walk.sofar')}>
      {#each done as step (step.id)}
        <li>
          <strong>{tr(`walk.${scenarioId}.${step.id}.label`)}</strong>
          {#each step.frame as line, i (i)}<p class="drill-mono lab-frame">{line}</p>{/each}
        </li>
      {/each}
    </ol>
  {/if}

  {#if finished}
    <div class="drill-done" role="status">
      <p class="drill-done-score">{tr('drill.setResult', { right: firstTries, total: scenario.steps.length })}</p>
      <div class="drill-actions"><button type="button" class="btn" onclick={again}>{tr('drill.again')}</button></div>
    </div>
  {:else}
    <div class="drill-card" data-state={revealed ? 'right' : wrong.length ? 'wrong' : 'asking'}>
      <p class="drill-count muted small">{tr('walk.step', { n: index + 1, total: scenario.steps.length })}</p>
      <p class="drill-prompt">{tr(index === 0 ? `walk.qFirst.${scenarioId}` : 'walk.q')}</p>
      <div class="lab-options" role="group" aria-label={tr('walk.options')}>
        {#each choice.keys as key, i (key)}
          <button
            type="button"
            class="btn secondary lab-option"
            data-state={revealed && i === choice.correct ? 'right' : wrong.includes(i) ? 'wrong' : 'idle'}
            disabled={wrong.includes(i) || (revealed && i !== choice.correct)}
            onclick={() => guess(i)}
          >{tr(key)}</button>
        {/each}
      </div>
      <div class="drill-feedback" role="status" aria-live="polite">
        {#if revealed}
          <p class="drill-right">{wrong.length === 0 ? tr('drill.right') : tr('drill.rightAfter')}</p>
        {:else if wrong.length}
          <p class="drill-wrong">{tr('walk.wrong')}</p>
        {/if}
      </div>
      {#if revealed}
        <p>{tr(`walk.${scenarioId}.${scenario.steps[index].id}.why`)}</p>
        {#each scenario.steps[index].frame as line, i (i)}<p class="drill-mono lab-frame">{line}</p>{/each}
        <div class="drill-form"><button type="button" class="btn" onclick={next}>{index + 1 >= scenario.steps.length ? tr('drill.seeResult') : tr('drill.next')}</button></div>
      {:else}
        <p class="muted small">{tr('walk.guessNote')}</p>
      {/if}
    </div>
  {/if}
</div>
