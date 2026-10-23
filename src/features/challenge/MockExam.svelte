<script lang="ts">
  // Mock exam: questions from the whole course against a clock, with no hints and no feedback
  // until the end, then a score, a grade and every mistake with its explanation.
  import { untrack } from 'svelte';
  import { app, displayTitle, getCourse, navigate } from '../../core/state.svelte.ts';
  import { buildMockExam, EXAM_SIZES, examMinutes } from '../../core/exercise.ts';
  import { courseSkills } from '../../core/mastery.ts';
  import { entryModuleId } from '../../core/home.ts';
  import { studyContext } from '../../core/studyContext.ts';
  import { getBlockRenderer } from '../../blocks/registry.ts';
  import type { Block, BlockContext, Question } from '../../core/types.ts';
  import MasteryIcon from '../../ui/MasteryIcon.svelte';
  import NavIcon from '../../ui/NavIcon.svelte';
  import { t } from '../../i18n/i18n.ts';

  let { courseId }: { courseId: string } = $props();

  const course = $derived(getCourse(courseId));
  const pool = $derived(course ? courseSkills(course).filter((s) => s.lessonId !== null).reduce((n, s) => n + s.questionIds.length, 0) : 0);
  const sizes = $derived(EXAM_SIZES.filter((n, i) => i === 0 || n <= pool));
  let size = $state<number>(EXAM_SIZES[1]);
  let seed = $state(Math.floor(Math.random() * 2 ** 31));
  let deadline = $state<number | null>(null);

  const questions = $derived.by<Question[]>(() => {
    const c = course;
    const n = Math.min(size, Math.max(1, pool));
    const s = seed;
    if (!c) return [];
    return untrack(() => buildMockExam(c, s, n));
  });
  const minutes = $derived(examMinutes(questions));
  const block = $derived<Block>({ id: `exam-${courseId}-${seed}`, type: 'quiz', questions });

  const ctx = $derived.by<BlockContext | undefined>(() => {
    if (!course || deadline === null) return undefined;
    return studyContext(courseId, { lessonId: 'exam', itemKind: 'test', moduleId: null }, { inTest: true, onSetContinue: backToCourse, freshRun: true, examDeadline: deadline });
  });

  function backToCourse() {
    const c = course;
    if (!c) {
      navigate({ name: 'home' });
      return;
    }
    const moduleId = entryModuleId(c, app.progress[courseId]);
    if (moduleId) navigate({ name: 'unit', courseId, moduleId });
    else navigate({ name: 'player', courseId });
    window.scrollTo({ top: 0 });
  }

  function start() {
    deadline = Date.now() + minutes * 60_000;
    window.scrollTo({ top: 0 });
  }

  function again() {
    seed = Math.floor(Math.random() * 2 ** 31);
    deadline = null;
    window.scrollTo({ top: 0 });
  }
</script>

<section class="cf-exercise cf-challenge">
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

    <header class="cf-exercise-head">
      <MasteryIcon kind="test" size={40} />
      <div>
        <p class="cf-muted cf-small">{displayTitle(course)}</p>
        <h1>{t('exam.title')}</h1>
      </div>
    </header>

    {#if questions.length === 0}
      <div class="cf-card">
        <p>{t('challenge.empty')}</p>
        <button type="button" class="cf-btn cf-btn-secondary" onclick={backToCourse}>{t('challenge.back')}</button>
      </div>
    {:else if deadline === null}
      <div class="cf-card cf-challenge-intro">
        <p>{t('exam.intro')}</p>
        <fieldset class="cf-exam-size">
          <legend>{t('exam.length')}</legend>
          {#each sizes as n (n)}
            <label class="cf-choice"><input type="radio" name="exam-size" value={n} bind:group={size} />{t('exam.questions', { n: Math.min(n, pool) })}</label>
          {/each}
        </fieldset>
        <ul class="cf-challenge-points">
          <li>{t('exam.point.time', { n: minutes })}</li>
          <li>{t('exam.point.noHelp')}</li>
          <li>{t('exam.point.results')}</li>
        </ul>
        <div class="cf-actions">
          <button type="button" class="cf-btn cf-btn-primary" onclick={start}>{t('exam.start')}</button>
          <button type="button" class="cf-btn cf-btn-ghost" onclick={backToCourse}>{t('challenge.back')}</button>
        </div>
      </div>
    {:else if ctx}
      {@const Renderer = getBlockRenderer('quiz')}
      {#key `${courseId}:${seed}`}
        {#if Renderer}<Renderer {block} {ctx} />{/if}
      {/key}
      <div class="cf-actions">
        <button type="button" class="cf-btn cf-btn-secondary" onclick={again}>{t('exam.again')}</button>
        <button type="button" class="cf-btn cf-btn-ghost" onclick={backToCourse}>{t('challenge.back')}</button>
      </div>
    {/if}
  {/if}
</section>
