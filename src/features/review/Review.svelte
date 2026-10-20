<script lang="ts">
  // Review: today's spaced reviews (every answered question comes back when it is about to be
  // forgotten, capped per day) and the mistakes list (every question whose latest answer is
  // wrong). Each practice run is frozen when it starts, so answering never reshuffles it.
  import { app, displayTitle, getCourse, navigate } from '../../core/state.svelte.ts';
  import { groupMistakes, indexQuestions, listMistakes, mistakesToBlock, type MistakeEntry } from '../../core/mistakes.ts';
  import { FINAL_EXAM_ITEM_ID, testItemId } from '../../core/course-utils.ts';
  import { dueCards, reviewedToday, todayQueue, type DueCard } from '../../core/srs.ts';
  import { studyContext } from '../../core/studyContext.ts';
  import { getBlockRenderer } from '../../blocks/registry.ts';
  import type { Block, BlockContext, Question } from '../../core/types.ts';
  import { t } from '../../i18n/i18n.ts';

  type Mode = 'list' | 'due' | 'mistakes';
  let mode = $state<Mode>('list');
  let session = $state.raw<MistakeEntry[]>([]);
  let dueSession = $state.raw<{ courseId: string; questions: Question[] }[]>([]);

  const mistakes = $derived(listMistakes(app.courses, app.progress, app.settings.questionLanguage));
  const groups = $derived(groupMistakes(mistakes));
  const practiceGroups = $derived(groupMistakes(session));
  const total = $derived(mistakes.length);

  const indexes = $derived(new Map(app.courses.map((course) => [course.id, indexQuestions(course)])));
  const queue = $derived.by(() => {
    const now = new Date();
    const due = dueCards(app.courses, app.mastery, (courseId, qid) => indexes.get(courseId)?.has(qid) === true, now);
    return todayQueue(due, reviewedToday(app.mastery, now), app.settings.dailyReviewLimit);
  });

  function startMistakes(entries: MistakeEntry[]) {
    session = [...entries];
    mode = 'mistakes';
    window.scrollTo({ top: 0 });
  }

  function startDue(cards: DueCard[]) {
    const byCourse = new Map<string, Question[]>();
    for (const card of cards) {
      const question = indexes.get(card.courseId)?.get(card.questionId)?.question;
      if (!question) continue;
      const list = byCourse.get(card.courseId) ?? [];
      list.push(question);
      byCourse.set(card.courseId, list);
    }
    dueSession = [...byCourse.entries()].map(([courseId, questions]) => ({ courseId, questions }));
    mode = 'due';
    window.scrollTo({ top: 0 });
  }

  function stop() {
    mode = 'list';
    session = [];
    dueSession = [];
  }

  function courseName(id: string): string {
    const course = getCourse(id);
    return course ? displayTitle(course) : id;
  }

  function dueBlock(courseId: string, questions: Question[]): Block {
    return { id: 'review-due-' + courseId, type: 'quiz', questions };
  }

  function mistakeCtx(entries: MistakeEntry[]): BlockContext | undefined {
    const first = entries[0];
    if (!first) return undefined;
    const course = getCourse(first.courseId);
    const itemId = first.itemId;
    const itemKind: 'lesson' | 'test' | 'exam' =
      itemId === FINAL_EXAM_ITEM_ID ? 'exam' : itemId.endsWith(':test') ? 'test' : 'lesson';
    const moduleId = course
      ? (course.modules.find((m) => m.id === itemId || testItemId(m.id) === itemId || m.lessons.some((l) => l.id === itemId))?.id ?? null)
      : null;
    return studyContext(first.courseId, { lessonId: itemId, itemKind, moduleId }, { onSetContinue: stop });
  }

  function dueCtx(courseId: string): BlockContext {
    return studyContext(courseId, { lessonId: 'review', itemKind: 'lesson', moduleId: null }, { onSetContinue: stop });
  }

  /** The prompt as plain text for the list (puzzle prompts start with bold Markdown). */
  function plainPrompt(text: string): string {
    return text.replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
  }
</script>

<section class="cf-review">
  {#if mode === 'due'}
    <div class="cf-section-head">
      <h1>{t('review.todayTitle')}</h1>
      <button type="button" class="cf-btn cf-btn-secondary" onclick={stop}>{t('review.back')}</button>
    </div>
    <p class="cf-muted">{t('review.todayHint')}</p>
    {#each dueSession as group (group.courseId)}
      {@const Renderer = getBlockRenderer('quiz')}
      <section class="cf-review-group">
        <h2>{courseName(group.courseId)}</h2>
        {#if Renderer}<Renderer block={dueBlock(group.courseId, group.questions)} ctx={dueCtx(group.courseId)} />{/if}
      </section>
    {/each}
    <div class="cf-actions">
      <button type="button" class="cf-btn cf-btn-primary" onclick={stop}>{t('review.done')}</button>
    </div>
  {:else if mode === 'mistakes'}
    <div class="cf-section-head">
      <h1>{t('review.title')}</h1>
      <button type="button" class="cf-btn cf-btn-secondary" onclick={stop}>{t('review.back')}</button>
    </div>
    <p class="cf-muted">{t('review.hint')}</p>

    {#each practiceGroups as group (group.courseId)}
      {@const Renderer = getBlockRenderer('quiz')}
      {@const ctx = mistakeCtx(group.entries)}
      <section class="cf-review-group">
        <h2>{courseName(group.courseId)}</h2>
        {#if Renderer && ctx}
          <Renderer block={mistakesToBlock(group.entries, 'mistake-practice-' + group.courseId)} {ctx} />
        {/if}
      </section>
    {/each}

    <div class="cf-actions">
      <button type="button" class="cf-btn cf-btn-primary" onclick={stop}>{t('review.done')}</button>
    </div>
  {:else}
    <div class="cf-section-head"><h1>{t('review.pageTitle')}</h1></div>

    <section class="cf-card cf-today-review" aria-labelledby="today-review-title">
      <div>
        <h2 id="today-review-title">{t('review.todayTitle')}</h2>
        {#if queue.cards.length > 0}
          <p>{queue.cards.length === 1 ? t('review.dueOne') : t('review.dueMany', { n: queue.cards.length })}</p>
        {:else if queue.waiting > 0}
          <p>{t('review.limitReached', { n: queue.limit })}</p>
        {:else}
          <p>{t('review.nothingDue')}</p>
        {/if}
        <p class="cf-muted cf-small">
          {t('review.doneToday', { done: queue.done, limit: queue.limit })}
          {#if queue.waiting > 0}<span> {t('review.waiting', { n: queue.waiting })}</span>{/if}
        </p>
      </div>
      {#if queue.cards.length > 0}
        <button type="button" class="cf-btn cf-btn-primary" onclick={() => startDue(queue.cards)}>{t('review.startToday')}</button>
      {:else if app.courses.length === 0}
        <button type="button" class="cf-btn cf-btn-secondary" onclick={() => navigate({ name: 'import' })}>{t('home.import')}</button>
      {/if}
    </section>

    <div class="cf-section-head">
      <div>
        <h2>{t('review.title')}</h2>
        {#if total > 0}
          <p class="cf-muted">{total === 1 ? t('review.count', { n: total }) : t('review.countPlural', { n: total })}</p>
        {/if}
      </div>
      {#if total > 0}
        <button type="button" class="cf-btn cf-btn-secondary" onclick={() => startMistakes(mistakes)}>{t('review.practise')}</button>
      {/if}
    </div>

    {#if total === 0}
      <div class="cf-card cf-empty-card">
        <h3>{t('review.empty')}</h3>
        <p class="cf-muted">{t('review.emptyHint')}</p>
      </div>
    {:else}
      <p class="cf-muted">{t('review.hint')}</p>
      {#each groups as group (group.courseId)}
        <section class="cf-review-group">
          <header>
            <h3>{courseName(group.courseId)}</h3>
            <span class="cf-muted cf-small">{t('review.groupCount', { n: group.entries.length })}</span>
            <button type="button" class="cf-btn cf-btn-secondary cf-btn-small" onclick={() => startMistakes(group.entries)}>{t('review.practiseCourse')}</button>
          </header>
          <ol class="cf-review-list">
            {#each group.entries as entry (entry.question.id)}
              <li>{plainPrompt(entry.prompt)}{#if entry.question.kind === 'chess'} <span class="cf-muted cf-small">{t('review.chessPuzzle')}</span>{/if}</li>
            {/each}
          </ol>
        </section>
      {/each}
    {/if}
  {/if}
</section>
