<script lang="ts">
  // Every flashcard of a course in one shuffled run. A card you miss comes back a few cards
  // later; the run ends when each card was known once. Nothing here counts for mastery.
  import { untrack } from 'svelte';
  import { app, courseSettings, displayTitle, getCourse, navigate } from '../../core/state.svelte.ts';
  import { afterAnswer, courseDeck, deckToText, shuffleDeck, type DeckCard } from '../../core/cards.ts';
  import { downloadFile } from '../../core/download.ts';
  import { entryModuleId } from '../../core/home.ts';
  import { renderMarkdown } from '../../core/markdown.ts';
  import NavIcon from '../../ui/NavIcon.svelte';
  import { t } from '../../i18n/i18n.ts';

  let { courseId }: { courseId: string } = $props();

  const course = $derived(getCourse(courseId));
  const lang = $derived(courseSettings(courseId).explanationLanguage);
  let unit = $state('');
  let seed = $state(Math.floor(Math.random() * 2 ** 31));

  const deck = $derived(course ? courseDeck(course, lang, unit || undefined) : []);
  const unitsWithCards = $derived(
    course ? course.modules.filter((m) => courseDeck(course, lang, m.id).length > 0) : []
  );

  let queue = $state<DeckCard[]>([]);
  let revealed = $state(false);
  let missed = $state(new Set<string>());
  $effect(() => {
    const cards = shuffleDeck(deck, seed);
    untrack(() => {
      queue = cards;
      revealed = false;
      missed = new Set();
    });
  });

  const card = $derived(queue[0]);
  const done = $derived(deck.length - new Set(queue.map((c) => c.id)).size);
  const firstTry = $derived(deck.length - missed.size);

  function answer(knewIt: boolean) {
    if (!card) return;
    if (!knewIt) missed = new Set([...missed, card.id]);
    queue = afterAnswer(queue, knewIt);
    revealed = false;
  }

  function again(onlyMissed: boolean) {
    if (onlyMissed) {
      const ids = missed;
      queue = shuffleDeck(deck.filter((c) => ids.has(c.id)), seed + 1);
      missed = new Set();
      revealed = false;
    } else {
      seed = Math.floor(Math.random() * 2 ** 31);
    }
  }

  function exportDeck() {
    if (!course || deck.length === 0) return;
    downloadFile(`${course.id}${unit ? '-' + unit : ''}-cards.txt`, deckToText(deck), 'text/plain;charset=utf-8');
  }

  function backToCourse() {
    const c = course;
    const moduleId = c ? entryModuleId(c, app.progress[courseId]) : undefined;
    if (c && moduleId) navigate({ name: 'unit', courseId, moduleId });
    else if (c) navigate({ name: 'player', courseId });
    else navigate({ name: 'home' });
  }

  function onKey(event: KeyboardEvent) {
    if (!card || event.ctrlKey || event.metaKey || event.altKey) return;
    if ((event.target as HTMLElement | null)?.closest('input, textarea, select, button, a')) return;
    if (!revealed && (event.key === ' ' || event.key === 'Enter')) revealed = true;
    else if (revealed && event.key === '1') answer(false);
    else if (revealed && (event.key === '2' || event.key === ' ' || event.key === 'Enter')) answer(true);
    else return;
    event.preventDefault();
  }
</script>

<svelte:window onkeydown={onKey} />

<section class="cf-exercise cf-cards">
  {#if !course}
    <div class="cf-empty">
      <h1>{t('exercise.noCourse')}</h1>
      <button type="button" class="cf-btn cf-btn-secondary" onclick={() => navigate({ name: 'home' })}>{t('player.back')}</button>
    </div>
  {:else}
    <nav class="cf-breadcrumb" aria-label={t('unit.breadcrumb')}>
      <a href="#/home" aria-label={t('unit.home')}><NavIcon name="home" size={16} /></a>
      <span aria-hidden="true">•</span>
      <button type="button" class="cf-link" onclick={backToCourse}>{displayTitle(course)}</button>
    </nav>

    <header class="cf-cards-head">
      <h1>{t('cards.title')}</h1>
      {#if unitsWithCards.length > 1}
        <label class="cf-cards-unit">
          <span class="sr-only">{t('cards.unit')}</span>
          <select bind:value={unit}>
            <option value="">{t('cards.allUnits')}</option>
            {#each unitsWithCards as m (m.id)}<option value={m.id}>{m.title}</option>{/each}
          </select>
        </label>
      {/if}
      {#if deck.length > 0}
        <button type="button" class="cf-btn cf-btn-ghost cf-btn-small" onclick={exportDeck} title={t('cards.exportHint')}>{t('cards.export')}</button>
      {/if}
    </header>

    {#if deck.length === 0}
      <div class="cf-card">
        <p>{t('cards.empty')}</p>
        <button type="button" class="cf-btn cf-btn-secondary" onclick={backToCourse}>{t('challenge.back')}</button>
      </div>
    {:else if card}
      <div class="cf-cards-progress">
        <span class="cf-progress cf-progress-full" role="progressbar" aria-valuemin="0" aria-valuemax={deck.length} aria-valuenow={done} aria-label={t('cards.progress', { done, total: deck.length })}>
          <span style:width={(done / deck.length) * 100 + '%'}></span>
        </span>
        <span class="cf-muted cf-small">{t('cards.progress', { done, total: deck.length })}</span>
      </div>
      {#key card.id + ':' + queue.length}
        <button type="button" class="flashcard cf-cards-card" class:revealed onclick={() => (revealed = !revealed)} aria-live="polite">
          <span class="flashcard-face-label">{revealed ? t('flashcards.back') : t('flashcards.front')}</span>
          <span class="prose flashcard-copy" {lang}>{@html renderMarkdown(revealed ? card.back : card.front)}</span>
          <span class="cf-cards-from cf-muted cf-small">{card.lessonTitle}</span>
        </button>
      {/key}
      {#if !revealed}
        <div class="cf-actions"><button type="button" class="cf-btn cf-btn-primary" onclick={() => (revealed = true)}>{t('flashcards.reveal')}</button></div>
      {:else}
        <div class="cf-actions">
          <button type="button" class="cf-btn cf-btn-secondary" onclick={() => answer(false)}>{t('flashcards.practiceAgain')}</button>
          <button type="button" class="cf-btn cf-btn-primary" onclick={() => answer(true)}>{t('flashcards.knowIt')}</button>
        </div>
      {/if}
      <p class="cf-cards-keys cf-muted cf-small">{t('cards.keys')}</p>
    {:else}
      <div class="cf-card cf-cards-done" role="status">
        <h2>{t('cards.doneTitle')}</h2>
        <p>{t('cards.doneText', { first: firstTry, total: deck.length })}</p>
        <div class="cf-actions">
          {#if missed.size > 0}
            <button type="button" class="cf-btn cf-btn-primary" onclick={() => again(true)}>{t('cards.repeatMissed', { n: missed.size })}</button>
          {/if}
          <button type="button" class="cf-btn cf-btn-secondary" onclick={() => again(false)}>{t('cards.shuffleAgain')}</button>
          <button type="button" class="cf-btn cf-btn-ghost" onclick={backToCourse}>{t('challenge.back')}</button>
        </div>
      </div>
    {/if}
  {/if}
</section>
