<script lang="ts">
  // The picture of a hotspot question: tap where the answer is. A marker shows the tap; once the
  // question is done (or the solution is shown) the right area is outlined.
  import type { Question } from '../../core/types.ts';
  import { sanitizeSvg } from '../../core/markdown.ts';
  import { hotspotHit } from '../../core/grade.ts';
  import { t } from '../../i18n/i18n.ts';

  let {
    question,
    picked,
    reveal = false,
    wrong = false,
    disabled = false,
    onpick
  }: {
    question: Question;
    picked?: { x: number; y: number };
    /** Outline the right area. */
    reveal?: boolean;
    /** The current pick was checked and is wrong. */
    wrong?: boolean;
    disabled?: boolean;
    onpick?: (x: number, y: number) => void;
  } = $props();

  const svg = $derived(question.svg ? sanitizeSvg(question.svg) : '');
  const right = $derived(Number.isInteger(question.answer) ? question.areas?.[question.answer as number] : undefined);
  const pickedArea = $derived(picked ? hotspotHit(question.areas, picked.x, picked.y) : -1);

  function tap(event: MouseEvent) {
    if (disabled) return;
    const el = event.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const x = Math.round(((event.clientX - r.left) / r.width) * 1000) / 10;
    const y = Math.round(((event.clientY - r.top) / r.height) * 1000) / 10;
    onpick?.(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
  }

  /** Keyboard use: arrow keys move through the areas, Enter picks the one in focus. */
  let focusArea = $state(-1);
  function key(event: KeyboardEvent) {
    const areas = question.areas ?? [];
    if (disabled || areas.length === 0) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusArea = (focusArea + 1) % areas.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusArea = (focusArea - 1 + areas.length) % areas.length;
    } else if ((event.key === 'Enter' || event.key === ' ') && focusArea >= 0) {
      event.preventDefault();
      const a = areas[focusArea]!;
      onpick?.(a.x + a.w / 2, a.y + a.h / 2);
    }
  }
</script>

<div class="hotspot">
  <div
    class="hotspot-pic"
    class:disabled
    role="button"
    tabindex={disabled ? -1 : 0}
    aria-label={(question.alt ? question.alt + '. ' : '') + t('quiz.hotspotHelp')}
    onclick={tap}
    onkeydown={key}
  >
    {#if svg}
      <div class="hotspot-svg">{@html svg}</div>
    {:else if question.image}
      <img src={question.image} alt={question.alt ?? ''} draggable="false" />
    {/if}
    {#if focusArea >= 0 && !disabled}
      {@const a = question.areas?.[focusArea]}
      {#if a}<span class="hotspot-area focus" style:left={a.x + '%'} style:top={a.y + '%'} style:width={a.w + '%'} style:height={a.h + '%'}></span>{/if}
    {/if}
    {#if reveal && right}
      <span class="hotspot-area right" style:left={right.x + '%'} style:top={right.y + '%'} style:width={right.w + '%'} style:height={right.h + '%'}></span>
    {/if}
    {#if picked}
      <span class="hotspot-mark" class:wrong class:right={reveal && pickedArea === question.answer} style:left={picked.x + '%'} style:top={picked.y + '%'} aria-hidden="true"></span>
    {/if}
  </div>
  {#if reveal && right?.label}<p class="muted small">{t('quiz.hotspotIs', { label: right.label })}</p>{/if}
</div>
