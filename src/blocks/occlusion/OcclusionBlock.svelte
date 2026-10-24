<script lang="ts">
  // Image occlusion: parts of a picture are covered. "Explore" uncovers any part by tapping it;
  // "Test me" outlines one covered part at a time, the learner thinks of the answer, shows it and
  // says whether they knew it.
  import { untrack } from 'svelte';
  import type { Block, BlockContext } from '../../core/types.ts';
  import { sanitizeSvg } from '../../core/markdown.ts';
  import { occlusionMasks, occlusionPicture, testOrder } from '../../core/occlusion.ts';
  import { t } from '../../i18n/i18n.ts';

  let { block, ctx }: { block: Block; ctx: BlockContext } = $props();

  const lang = $derived(ctx.explanationLanguage);
  const masks = $derived(occlusionMasks(block, lang));
  const picture = $derived(occlusionPicture(block, lang));
  const svg = $derived(picture.svg ? sanitizeSvg(picture.svg) : '');

  let mode = $state<'explore' | 'test'>('explore');
  let open = $state<number[]>([]);
  let order = $state<number[]>([]);
  let step = $state(0);
  let shown = $state(false);
  let knew = $state(0);
  let finished = $state(false);

  const target = $derived(mode === 'test' && !finished ? order[step] : -1);
  const isOpen = (i: number): boolean => open.includes(i);

  function toggle(i: number) {
    if (mode !== 'explore') return;
    open = isOpen(i) ? open.filter((x) => x !== i) : [...open, i];
  }

  function startTest() {
    mode = 'test';
    open = [];
    order = testOrder(untrack(() => masks.length));
    step = 0;
    shown = false;
    knew = 0;
    finished = false;
  }

  function explore() {
    mode = 'explore';
    open = [];
  }

  function answer(got: boolean) {
    if (got) knew += 1;
    open = [...open, order[step]];
    shown = false;
    if (step + 1 >= order.length) finished = true;
    else step += 1;
  }
</script>

<section class="block occlusion" lang={ctx.explanationLanguage}>
  {#if masks.length === 0 || (!svg && !picture.url)}
    <p class="muted small">{t('occlusion.empty')}</p>
  {:else}
    <div class="occlusion-bar">
      <div class="cf-segmented" role="group" aria-label={t('occlusion.modes')}>
        <button type="button" aria-pressed={mode === 'explore'} onclick={explore}>{t('occlusion.explore')}</button>
        <button type="button" aria-pressed={mode === 'test'} onclick={startTest}>{t('occlusion.test')}</button>
      </div>
      {#if mode === 'explore'}
        <button type="button" class="link" onclick={() => (open = open.length === masks.length ? [] : masks.map((_, i) => i))}>
          {open.length === masks.length ? t('occlusion.hideAll') : t('occlusion.showAll')}
        </button>
      {/if}
    </div>

    <div class="occlusion-pic" role="group" aria-label={picture.alt || t('occlusion.picture')}>
      {#if svg}<div class="occlusion-svg">{@html svg}</div>{:else}<img src={picture.url} alt={picture.alt} loading="lazy" referrerpolicy="no-referrer" />{/if}
      {#each masks as m, i (i)}
        <button
          type="button"
          class="occlusion-mask"
          class:open={isOpen(i)}
          class:target={target === i}
          style:left={m.x + '%'}
          style:top={m.y + '%'}
          style:width={m.w + '%'}
          style:height={m.h + '%'}
          aria-label={isOpen(i) ? m.label || t('occlusion.shown') : t('occlusion.covered', { n: i + 1 })}
          aria-pressed={isOpen(i)}
          disabled={mode === 'test'}
          onclick={() => toggle(i)}
        ></button>
      {/each}
    </div>

    {#if mode === 'explore'}
      <p class="muted small">{t('occlusion.hint', { open: open.length, total: masks.length })}</p>
      {#if open.length > 0}
        <ul class="occlusion-labels">
          {#each open as i (i)}{#if masks[i]?.label}<li>{masks[i].label}</li>{/if}{/each}
        </ul>
      {/if}
    {:else if finished}
      <div class="quiz-results" role="status">
        <p>{t('occlusion.result', { knew, total: masks.length })}</p>
        <div class="row"><button type="button" class="btn" onclick={startTest}>{t('drill.again')}</button></div>
      </div>
    {:else}
      <div class="occlusion-test" role="status">
        <p class="muted small">{t('occlusion.step', { n: step + 1, total: masks.length })}</p>
        <p>{t('occlusion.what')}</p>
        {#if shown}
          <p class="occlusion-answer"><strong>{masks[target]?.label || t('occlusion.noLabel')}</strong></p>
          <div class="row">
            <button type="button" class="btn" onclick={() => answer(true)}>{t('occlusion.knew')}</button>
            <button type="button" class="btn secondary" onclick={() => answer(false)}>{t('occlusion.notYet')}</button>
          </div>
        {:else}
          <div class="row"><button type="button" class="btn" onclick={() => (shown = true)}>{t('occlusion.show')}</button></div>
        {/if}
      </div>
    {/if}
  {/if}
</section>
