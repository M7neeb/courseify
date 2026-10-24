<script lang="ts">
  // The subnet drill: one task with several boxes (network, first host, ...), each box checked on its
  // own. Address boxes are four small octet fields on a number pad; typing "." moves to the next one.
  import { tick, untrack } from 'svelte';
  import { makeSubnetTask, checkSubnetField, SUBNET_MODES, type SubnetMode, type SubnetTask } from '../../core/subnet.ts';
  import type { Level, Line } from '../../core/drills.ts';
  import { renderMarkdown, renderTex } from '../../core/markdown.ts';
  import { recordActivity } from '../../core/state.svelte.ts';
  import { playCorrect, playWrong } from '../sound.ts';
  import { tIn } from '../../i18n/i18n.ts';

  let {
    level,
    lang,
    sounds = false,
    onResult
  }: {
    level: Level;
    lang: string;
    sounds?: boolean;
    onResult?: (r: { firstTry: boolean; solved: boolean }) => void;
  } = $props();

  const tr = (key: string, vars: Record<string, string | number> = {}) => tIn(lang, key, vars);

  const PREF_KEY = 'courseify:subnetPrefs';
  function loadPrefs(): { mode: SubnetMode; fill: boolean } {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}');
      return { mode: SUBNET_MODES.includes(p.mode) ? p.mode : 'full', fill: p.fill === true };
    } catch {
      return { mode: 'full', fill: false };
    }
  }
  const saved = loadPrefs();
  let mode = $state<SubnetMode>(saved.mode);
  let fill = $state(saved.fill);
  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ mode, fill }));
    } catch {
      /* private window: the choice just is not remembered */
    }
  }

  type Status = 'idle' | 'ok' | 'bad';

  let task = $state<SubnetTask>(untrack(() => makeSubnetTask(mode, level)));
  /** An address box is four octets, every other box one entry. */
  let values = $state<Record<string, string[]>>({});
  let status = $state<Record<string, Status>>({});
  let phase = $state<'asking' | 'right' | 'shown'>('asking');
  let checks = $state(0);
  let stepsShown = $state(0);
  let nextBtn = $state<HTMLButtonElement | null>(null);
  let root = $state<HTMLElement | null>(null);

  function resetValues() {
    const v: Record<string, string[]> = {};
    const s: Record<string, Status> = {};
    for (const f of task.fields) {
      s[f.id] = 'idle';
      if (f.kind === 'ip') {
        const parts = f.answer.split('.');
        v[f.id] = parts.map((p, i) => (fill && i < f.fixed ? p : ''));
      } else v[f.id] = [''];
    }
    values = v;
    status = s;
  }
  untrack(resetValues);

  const isFixed = (fieldId: string, i: number): boolean => {
    const f = task.fields.find((x) => x.id === fieldId);
    return !!f && f.kind === 'ip' && fill && i < f.fixed;
  };

  const joined = (id: string): string => (values[id] ?? []).join(task.fields.find((f) => f.id === id)?.kind === 'ip' ? '.' : '');
  const filled = (id: string): boolean => (values[id] ?? []).every((p) => p.trim() !== '');
  const canCheck = $derived(phase === 'asking' && task.fields.every((f) => status[f.id] === 'ok' || filled(f.id)));

  function check(event?: Event) {
    event?.preventDefault();
    if (!canCheck) return;
    checks++;
    let allOk = true;
    for (const f of task.fields) {
      if (status[f.id] === 'ok') continue;
      const ok = checkSubnetField(f, joined(f.id));
      status[f.id] = ok ? 'ok' : 'bad';
      if (!ok) allOk = false;
    }
    if (allOk) {
      phase = 'right';
      const firstTry = checks === 1 && stepsShown === 0;
      if (sounds) playCorrect();
      void recordActivity('correct');
      onResult?.({ firstTry, solved: true });
      void tick().then(() => nextBtn?.focus());
    } else {
      if (sounds) playWrong();
    }
  }

  function showSolution() {
    if (phase !== 'asking') return;
    for (const f of task.fields) {
      values[f.id] = f.kind === 'ip' ? f.answer.split('.') : [f.answer];
      status[f.id] = 'idle';
    }
    phase = 'shown';
    onResult?.({ firstTry: false, solved: false });
    void tick().then(() => nextBtn?.focus());
  }

  async function next() {
    task = makeSubnetTask(mode, level);
    resetValues();
    phase = 'asking';
    checks = 0;
    stepsShown = 0;
    await tick();
    root?.querySelector<HTMLInputElement>('input:not([readonly])')?.focus();
  }

  const stepGroups = $derived.by(() => {
    const groups: Line[][] = [];
    for (const line of task.steps) {
      if ('k' in line || groups.length === 0) groups.push([line]);
      else groups[groups.length - 1].push(line);
    }
    return groups;
  });
  const visibleSteps = $derived(phase === 'asking' ? stepGroups.slice(0, stepsShown) : stepGroups);

  function lineHtml(line: Line): string {
    if ('tex' in line) return renderTex(line.tex, true);
    if ('mono' in line) return '';
    return renderMarkdown(tr(line.k, line.v));
  }

  // A mode, level or fill change starts a new task.
  let started = '';
  $effect(() => {
    const key = `${mode}:${level}:${fill}`;
    if (started && started !== key) untrack(() => void next());
    started = key;
  });

  function setMode(m: SubnetMode) {
    if (m === mode) return;
    mode = m;
    savePrefs();
  }

  // ---------- Octet boxes ----------

  function boxes(fieldId: string): HTMLInputElement[] {
    return [...(root?.querySelectorAll<HTMLInputElement>(`[data-field="${fieldId}"] input`) ?? [])];
  }

  function focusBox(fieldId: string, i: number) {
    const list = boxes(fieldId);
    const target = list[i];
    if (target && !target.readOnly) {
      target.focus();
      target.select();
    } else if (target) focusBox(fieldId, i + 1);
  }

  function onOctetInput(fieldId: string, i: number, event: Event) {
    const el = event.target as HTMLInputElement;
    const digits = el.value.replace(/\D/g, '').slice(0, 3);
    values[fieldId][i] = digits;
    el.value = digits;
    if (status[fieldId] === 'bad') status[fieldId] = 'idle';
    if (i < 3 && (digits.length === 3 || (digits.length === 2 && Number(digits) > 25))) focusBox(fieldId, i + 1);
  }

  function onOctetKey(fieldId: string, i: number, event: KeyboardEvent) {
    if (event.key === '.' || event.key === ',' || event.key === ' ') {
      event.preventDefault();
      if (i < 3 && values[fieldId][i] !== '') focusBox(fieldId, i + 1);
    } else if (event.key === 'Backspace' && values[fieldId][i] === '' && i > 0) {
      event.preventDefault();
      let j = i - 1;
      while (j > 0 && isFixed(fieldId, j)) j--;
      if (!isFixed(fieldId, j)) focusBox(fieldId, j);
    }
  }

  /** Pasting "192.168.1.64" fills all the boxes. */
  function onOctetPaste(fieldId: string, event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text') ?? '';
    const parts = text.trim().split(/[.\s,]+/);
    if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return;
    event.preventDefault();
    const f = task.fields.find((x) => x.id === fieldId)!;
    values[fieldId] = parts.map((p, i) => (fill && i < f.fixed ? f.answer.split('.')[i] : p));
    if (status[fieldId] === 'bad') status[fieldId] = 'idle';
  }

  function onSingleInput(fieldId: string, event: Event) {
    const el = event.target as HTMLInputElement;
    values[fieldId][0] = el.value.replace(/[^\d./,']/g, '');
    if (status[fieldId] === 'bad') status[fieldId] = 'idle';
  }

  function choose(fieldId: string, answer: 'yes' | 'no') {
    if (phase !== 'asking' || status[fieldId] === 'ok') return;
    values[fieldId][0] = answer;
    if (status[fieldId] === 'bad') status[fieldId] = 'idle';
  }
</script>

<div class="subnet-drill" bind:this={root}>
  <div class="subnet-controls">
    <div class="cf-segmented" role="group" aria-label={tr('subnet.modes')}>
      {#each SUBNET_MODES as m (m)}
        <button type="button" aria-pressed={mode === m} onclick={() => setMode(m)}>{tr(`subnet.mode.${m}`)}</button>
      {/each}
    </div>
    <label class="subnet-fill">
      <input type="checkbox" bind:checked={fill} onchange={savePrefs} />
      <span>{tr('subnet.fill')}</span>
    </label>
  </div>
  {#if mode === 'exam'}<p class="muted small">{tr('subnet.examNote')}</p>{/if}

  <div class="drill-card" data-state={phase === 'asking' ? (task.fields.some((f) => status[f.id] === 'bad') ? 'wrong' : 'asking') : phase}>
    <div class="drill-prompt">
      {#each task.prompt as line, i (i)}
        {#if 'mono' in line}<p class="drill-mono">{line.mono}</p>{:else}<div class="drill-line">{@html lineHtml(line)}</div>{/if}
      {/each}
    </div>

    <form class="subnet-form" onsubmit={check}>
      {#each task.fields as f (f.id)}
        <div class="subnet-field" data-field={f.id} data-status={phase === 'shown' ? 'shown' : status[f.id]}>
          <span class="subnet-label" id={`sf-${f.id}`}>{tr(f.label)}</span>
          {#if f.kind === 'ip'}
            <div class="subnet-octets" role="group" aria-labelledby={`sf-${f.id}`}>
              {#each [0, 1, 2, 3] as i (i)}
                {#if i > 0}<span class="subnet-dot" aria-hidden="true">.</span>{/if}
                <input
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  spellcheck="false"
                  maxlength="3"
                  aria-label={tr('subnet.part', { label: tr(f.label), n: i + 1 })}
                  value={values[f.id]?.[i] ?? ''}
                  readonly={isFixed(f.id, i) || status[f.id] === 'ok' || phase !== 'asking'}
                  oninput={(e) => onOctetInput(f.id, i, e)}
                  onkeydown={(e) => onOctetKey(f.id, i, e)}
                  onpaste={(e) => onOctetPaste(f.id, e)}
                />
              {/each}
            </div>
          {:else if f.kind === 'int'}
            <div class="subnet-single">
              {#if f.id === 'prefix'}<span class="subnet-dot" aria-hidden="true">/</span>{/if}
              <input
                type="text"
                inputmode="decimal"
                autocomplete="off"
                spellcheck="false"
                aria-labelledby={`sf-${f.id}`}
                value={values[f.id]?.[0] ?? ''}
                readonly={status[f.id] === 'ok' || phase !== 'asking'}
                oninput={(e) => onSingleInput(f.id, e)}
              />
            </div>
          {:else}
            <div class="subnet-yesno" role="group" aria-labelledby={`sf-${f.id}`}>
              {#each ['yes', 'no'] as a (a)}
                <button type="button" class="btn secondary" aria-pressed={values[f.id]?.[0] === a} onclick={() => choose(f.id, a as 'yes' | 'no')}>
                  {tr(`subnet.${a}`)}
                </button>
              {/each}
            </div>
          {/if}
          {#if status[f.id] === 'ok'}<span class="subnet-mark good" aria-label={tr('subnet.boxRight')}>&#10003;</span>{/if}
          {#if status[f.id] === 'bad'}<span class="subnet-mark bad" aria-label={tr('subnet.boxWrong')}>&#10007;</span>{/if}
        </div>
      {/each}

      <div class="subnet-submit">
        {#if phase !== 'asking'}
          <button type="button" class="btn" bind:this={nextBtn} onclick={next}>{tr('drill.next')}</button>
        {:else}
          <button type="submit" class="btn" disabled={!canCheck}>{tr('drill.check')}</button>
        {/if}
      </div>
    </form>

    <div class="drill-feedback" role="status" aria-live="polite">
      {#if phase === 'right'}
        <p class="drill-right">{checks === 1 && stepsShown === 0 ? tr('drill.right') : tr('drill.rightAfter')}</p>
      {:else if phase === 'asking' && task.fields.some((f) => status[f.id] === 'bad')}
        <p class="drill-wrong">{tr('subnet.someWrong')}</p>
      {/if}
    </div>

    {#if phase === 'asking'}
      <div class="drill-actions">
        {#if stepsShown < stepGroups.length}
          <button type="button" class="link" onclick={() => (stepsShown = Math.min(stepGroups.length, stepsShown + 1))}>
            {stepsShown === 0 ? tr('drill.firstStep') : tr('drill.nextStep')}
          </button>
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
</div>
