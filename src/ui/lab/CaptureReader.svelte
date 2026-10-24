<script lang="ts">
  // Capture reader: a small Wireshark-style frame table. Tap a row to see its layers; questions ask
  // for a row or for one value read off the capture.
  import { CAPTURE_FRAMES, CAPTURE_QUESTIONS, type CaptureQuestion } from '../../core/labData.ts';
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

  const shuffled = (): CaptureQuestion[] => {
    const list = [...CAPTURE_QUESTIONS];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list.slice(0, 6);
  };

  let questions = $state<CaptureQuestion[]>(shuffled());
  let qi = $state(0);
  const q = $derived(questions[qi]);
  let selected = $state<number | null>(null);
  let wrongRows = $state<number[]>([]);
  let wrongChoices = $state<number[]>([]);
  let solved = $state(false);
  let finished = $state(false);
  let firstTries = $state(0);
  const detailFrame = $derived(CAPTURE_FRAMES.find((f) => f.no === selected));
  const misses = $derived(wrongRows.length + wrongChoices.length);

  function resolve(ok: boolean) {
    if (ok) {
      solved = true;
      const first = misses === 0;
      if (first) firstTries++;
      if (sounds) playCorrect();
      void recordActivity('correct');
      onResult?.({ firstTry: first, solved: true });
    } else if (sounds) playWrong();
  }

  function checkRow() {
    if (solved || q.kind !== 'row' || selected === null) return;
    if (selected === q.answer) resolve(true);
    else {
      wrongRows = [...wrongRows, selected];
      resolve(false);
    }
  }

  function chooseOption(i: number) {
    if (solved || q.kind !== 'choice' || wrongChoices.includes(i)) return;
    if (i === q.answer) resolve(true);
    else {
      wrongChoices = [...wrongChoices, i];
      resolve(false);
    }
  }

  function clearQuestion() {
    selected = null;
    wrongRows = [];
    wrongChoices = [];
    solved = false;
  }

  function next() {
    if (qi + 1 >= questions.length) {
      finished = true;
      return;
    }
    qi++;
    clearQuestion();
  }

  function again() {
    questions = shuffled();
    qi = 0;
    clearQuestion();
    finished = false;
    firstTries = 0;
  }
</script>

<div class="lab-capture">
  <div class="cap-list" role="group" aria-label={tr('cap.table')}>
    <div class="cap-head" aria-hidden="true">
      <span class="cap-no">No.</span><span class="cap-src">Source</span><span class="cap-dst">Destination</span><span class="cap-proto">Protocol</span><span class="cap-info">Info</span>
    </div>
    {#each CAPTURE_FRAMES as f (f.no)}
      <button
        type="button"
        class="cap-row"
        class:selected={selected === f.no}
        class:answer={solved && q.kind === 'row' && q.answer === f.no}
        class:wrong={wrongRows.includes(f.no) && !solved}
        data-proto={f.proto}
        aria-pressed={selected === f.no}
        onclick={() => (selected = f.no)}
      >
        <span class="cap-no">{f.no}</span>
        <span class="cap-src">{f.src}</span>
        <span class="cap-dst">{f.dst}</span>
        <span class="cap-proto">{f.proto}</span>
        <span class="cap-info">{f.info}</span>
      </button>
    {/each}
  </div>

  {#if detailFrame}
    <div class="cap-detail" aria-label={tr('cap.details')}>
      <p class="muted small">{tr('cap.frame', { n: detailFrame.no })} · {detailFrame.time} s</p>
      {#each detailFrame.detail as d, i (i)}<p class="drill-mono lab-frame">{d}</p>{/each}
    </div>
  {/if}

  {#if finished}
    <div class="drill-done" role="status">
      <p class="drill-done-score">{tr('drill.setResult', { right: firstTries, total: questions.length })}</p>
      <div class="drill-actions"><button type="button" class="btn" onclick={again}>{tr('drill.again')}</button></div>
    </div>
  {:else}
    <div class="drill-card" data-state={solved ? 'right' : misses ? 'wrong' : 'asking'}>
      <p class="drill-count muted small">{tr('drill.progress', { n: qi + 1, total: questions.length })}</p>
      <p class="drill-prompt">{tr(`cap.q.${q.id}`)}</p>
      {#if q.kind === 'choice'}
        <div class="lab-options" role="group" aria-label={tr('walk.options')}>
          {#each q.options as o, i (o)}
            <button
              type="button"
              class="btn secondary lab-option"
              data-state={solved && i === q.answer ? 'right' : wrongChoices.includes(i) ? 'wrong' : 'idle'}
              disabled={wrongChoices.includes(i) || (solved && i !== q.answer)}
              onclick={() => chooseOption(i)}
            >{o}</button>
          {/each}
        </div>
      {:else if !solved}
        <div class="drill-form">
          <button type="button" class="btn" disabled={selected === null} onclick={checkRow}>{tr('drill.check')}</button>
          <span class="muted small">{tr('cap.tapRow')}</span>
        </div>
      {/if}
      <div class="drill-feedback" role="status" aria-live="polite">
        {#if solved}
          <p class="drill-right">{misses === 0 ? tr('drill.right') : tr('drill.rightAfter')}</p>
        {:else if misses}
          <p class="drill-wrong">{tr('cap.wrong')}</p>
        {/if}
      </div>
      {#if solved}
        <p>{tr(`cap.why.${q.id}`)}</p>
        <div class="drill-form"><button type="button" class="btn" onclick={next}>{qi + 1 >= questions.length ? tr('drill.seeResult') : tr('drill.next')}</button></div>
      {/if}
    </div>
  {/if}
</div>
