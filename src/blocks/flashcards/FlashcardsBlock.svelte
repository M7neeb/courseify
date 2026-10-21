<script lang="ts">
  import type { Block, BlockContext } from '../../core/types.ts';
  import { renderMarkdown } from '../../core/markdown.ts';
  import { resolveFlashcards } from '../../core/localize.ts';
  import { t } from '../../i18n/i18n.ts';

  let { block, ctx }: { block: Block; ctx?: BlockContext } = $props();
  const cards = $derived(resolveFlashcards(block, ctx?.explanationLanguage ?? 'en'));
  let index = $state(0);
  let revealed = $state(false);
  let known = $state(0);
  let finished = $state(false);

  function next(remembered: boolean) {
    if (remembered) known += 1;
    if (index + 1 >= cards.length) finished = true;
    else index += 1;
    revealed = false;
  }

  function restart() {
    index = 0;
    known = 0;
    finished = false;
    revealed = false;
  }
</script>

{#if cards.length > 0}
  <section class="block flashcard-deck" aria-label={t('flashcards.title')}>
    {#if finished}
      <div class="flashcard-finish" role="status">
        <p class="flashcard-count">{t('flashcards.sessionComplete')}</p>
        <h2>{t('flashcards.remembered', { known, total: cards.length })}</h2>
        <button type="button" class="btn" onclick={restart}>{t('flashcards.again')}</button>
      </div>
    {:else}
      {@const card = cards[index]}
      <div class="flashcard-topline">
        <span>{t('flashcards.title')}</span>
        <span class="muted">{t('flashcards.cardOf', { current: index + 1, total: cards.length })}</span>
      </div>
      <div class="flashcard" class:revealed aria-live="polite">
        <p class="flashcard-face-label">{revealed ? t('flashcards.back') : t('flashcards.front')}</p>
        <div class="prose flashcard-copy">{@html renderMarkdown(revealed ? card.back : card.front)}</div>
      </div>
      {#if !revealed}
        <button type="button" class="btn" onclick={() => (revealed = true)}>{t('flashcards.reveal')}</button>
      {:else}
        <div class="row flashcard-actions">
          <button type="button" class="btn" onclick={() => next(false)}>{t('flashcards.practiceAgain')}</button>
          <button type="button" class="btn primary" onclick={() => next(true)}>{t('flashcards.knowIt')}</button>
        </div>
      {/if}
    {/if}
  </section>
{/if}
