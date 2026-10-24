<script lang="ts">
  // Binary with tappable tiles: a decimal number is shown, the learner taps the tiles 128, 64, 32, ...
  // that add up to it. The tiles are lit like bits; the sum and the 0/1 row update as they tap.
  import { untrack } from 'svelte';
  import type { Level } from '../../core/drills.ts';
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

  const bitCount = $derived(level === 1 ? 4 : level === 2 ? 6 : 8);
  const tiles = $derived(Array.from({ length: bitCount }, (_, i) => 2 ** (bitCount - 1 - i)));

  const roll = (bits: number): number => 2 + Math.floor(Math.random() * (2 ** bits - 3));
  let target = $state(untrack(() => roll(level === 1 ? 4 : level === 2 ? 6 : 8)));
  let on = $state<boolean[]>([]);
  let phase = $state<'asking' | 'right' | 'wrong'>('asking');
  let tries = $state(0);
  let solved = $state(false);

  const sum = $derived(tiles.reduce((a, v, i) => a + (on[i] ? v : 0), 0));
  const bitRow = $derived(tiles.map((_, i) => (on[i] ? '1' : '0')).join(''));

  function fresh() {
    target = roll(bitCount);
    on = Array(bitCount).fill(false);
    phase = 'asking';
    tries = 0;
    solved = false;
  }

  function toggle(i: number) {
    if (phase === 'right') return;
    on[i] = !on[i];
    if (phase === 'wrong') phase = 'asking';
  }

  function check() {
    if (phase === 'right') return;
    tries++;
    if (sum === target) {
      phase = 'right';
      solved = true;
      if (sounds) playCorrect();
      void recordActivity('correct');
      onResult?.({ firstTry: tries === 1, solved: true });
    } else {
      phase = 'wrong';
      if (sounds) playWrong();
    }
  }

  let started = '';
  $effect(() => {
    const key = String(level);
    if (started && started !== key) untrack(fresh);
    started = key;
  });
  untrack(() => {
    on = Array(bitCount).fill(false);
  });
</script>

<div class="drill-card bit-tiles" data-state={phase}>
  <div class="drill-prompt">
    <p class="drill-line">{tr('bits.p')}</p>
    <p class="drill-mono bit-target" data-testid="bit-target">{target}</p>
  </div>

  <div class="bit-row" role="group" aria-label={tr('bits.tiles')}>
    {#each tiles as v, i (v)}
      <button type="button" class="bit-tile" class:on={on[i]} aria-pressed={on[i]} aria-label={String(v)} onclick={() => toggle(i)}>
        <span class="bit-value">{v}</span>
        <span class="bit-digit">{on[i] ? 1 : 0}</span>
      </button>
    {/each}
  </div>

  <p class="bit-sum" aria-live="polite">
    <span class="drill-mono">{bitRow}</span>
    <span class="muted">= {sum}</span>
  </p>

  <div class="drill-form">
    {#if phase === 'right'}
      <button type="button" class="btn" onclick={fresh}>{tr('drill.next')}</button>
    {:else}
      <button type="button" class="btn" onclick={check}>{tr('drill.check')}</button>
    {/if}
  </div>
  <div class="drill-feedback" role="status" aria-live="polite">
    {#if phase === 'right'}
      <p class="drill-right">{tries === 1 ? tr('drill.right') : tr('drill.rightAfter')}</p>
    {:else if phase === 'wrong'}
      <p class="drill-wrong">{sum > target ? tr('bits.tooMuch') : tr('bits.tooLittle')}</p>
    {/if}
  </div>
  {#if phase !== 'right'}
    <p class="muted small">{tr('bits.hint')}</p>
  {/if}
</div>
