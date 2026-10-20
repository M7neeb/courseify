<script lang="ts">
  // Course challenge: a mixed test with a few questions from every lesson of the course. Units are
  // shuffled together on purpose (mixed practice sticks better than one topic at a time). Answers
  // count as test answers, so a Proficient skill can become Mastered here, and a miss can cost a
  // Proficient or Mastered skill one level.
  import { untrack } from 'svelte';
  import { app, displayTitle, getCourse, navigate } from '../../core/state.svelte.ts';
  import { buildChallengeSet, CHALLENGE } from '../../core/exercise.ts';
  import { entryModuleId } from '../../core/home.ts';
  import { studyContext } from '../../core/studyContext.ts';
  import { getBlockRenderer } from '../../blocks/registry.ts';
  import type { Block, BlockContext, Question } from '../../core/types.ts';
  import MasteryIcon from '../../ui/MasteryIcon.svelte';
  import NavIcon from '../../ui/NavIcon.svelte';
  import { t } from '../../i18n/i18n.ts';

  let { courseId }: { courseId: string } = $props();

  const course = $derived(getCourse(courseId));
  let started = $state(false);
  let seed = $state(Math.floor(Math.random() * 2 ** 31));

  // Settled once per seed from a snapshot of the saved mastery, so answering never reshuffles it.
  const questions = $derived.by<Question[]>(() => {
    const c = course;
    const currentSeed = seed;
    if (!c) return [];
    return untrack(() => buildChallengeSet(c, currentSeed, { mastery: app.mastery[courseId], now: new Date() }));
  });

  const block = $derived<Block>({ id: `challenge-${courseId}`, type: 'quiz', questions });

  const ctx = $derived.by<BlockContext | undefined>(() => {
    if (!course) return undefined;
    return studyContext(courseId, { lessonId: 'challenge', itemKind: 'test', moduleId: null }, { inTest: true, onSetContinue: backToCourse, freshRun: true });
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
    started = true;
    window.scrollTo({ top: 0 });
  }

  function again() {
    seed = Math.floor(Math.random() * 2 ** 31);
    started = true;
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
        <h1>{t('challenge.title')}</h1>
      </div>
    </header>

    {#if questions.length === 0}
      <div class="cf-card">
        <p>{t('challenge.empty')}</p>
        <button type="button" class="cf-btn cf-btn-secondary" onclick={backToCourse}>{t('challenge.back')}</button>
      </div>
    {:else if !started}
      <div class="cf-card cf-challenge-intro">
        <p>{t('challenge.intro', { n: questions.length })}</p>
        <ul class="cf-challenge-points">
          <li>{t('challenge.point.mixed', { n: CHALLENGE.perSkill })}</li>
          <li>{t('challenge.point.mastered')}</li>
          <li>{t('challenge.point.drop')}</li>
        </ul>
        <div class="cf-actions">
          <button type="button" class="cf-btn cf-btn-primary" onclick={start}>{t('challenge.start')}</button>
          <button type="button" class="cf-btn cf-btn-ghost" onclick={backToCourse}>{t('challenge.back')}</button>
        </div>
      </div>
    {:else if ctx}
      {@const Renderer = getBlockRenderer('quiz')}
      {#key `${courseId}:${seed}`}
        {#if Renderer}<Renderer {block} {ctx} />{/if}
      {/key}
      <div class="cf-actions">
        <button type="button" class="cf-btn cf-btn-secondary" onclick={again}>{t('challenge.again')}</button>
        <button type="button" class="cf-btn cf-btn-ghost" onclick={backToCourse}>{t('challenge.back')}</button>
      </div>
    {/if}
  {/if}
</section>
