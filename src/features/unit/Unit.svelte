<script lang="ts">
  // One unit (module): the course's units in a left sidebar,
  // then breadcrumbs, "Unit N: title", unit mastery, the legend and one mastery square per skill
  // (plus the star for the unit test), an "About this unit" card and one card per lesson with its
  // Learn and Practice rows. Gating is decided by the shared `gateForItem`, so 'free' mode never
  // locks anything while still showing the recommendation.
  import { app, courseSettings, displayTitle, getCourse, moduleMasteryPercentFor, navigate, saveReflection } from '../../core/state.svelte.ts';
  import { flattenCourse, lessonKind, testItemId, type FlatItem, type LessonKind } from '../../core/course-utils.ts';
  import { gateForItem, openGate, weakestSkillInModule, type Gate } from '../../core/gating.ts';
  import { MASTERY, courseSkills, itemForSkill, moduleMasteryPool, questionsToLevelUp, skillPoints, skillTitle, tierForPoints } from '../../core/mastery.ts';
  import { courseAccent } from '../../core/home.ts';
  import { isFading } from '../../core/srs.ts';
  import { lessonDigest, unitKeyPoints } from '../../core/reflect.ts';
  import ReflectCard from '../../ui/ReflectCard.svelte';
  import type { Lesson, MasteryTier } from '../../core/types.ts';
  import MasteryIcon from '../../ui/MasteryIcon.svelte';
  import MasteryLegend from '../../ui/MasteryLegend.svelte';
  import NavIcon from '../../ui/NavIcon.svelte';
  import { t } from '../../i18n/i18n.ts';

  import { lessonQuestionCount, readingMinutes, shows } from '../../core/layout.ts';
  import { skillRetention } from '../../core/srs.ts';

  let { courseId, moduleId }: { courseId: string; moduleId: string } = $props();

  const course = $derived(getCourse(courseId));
  const cs = $derived(courseSettings(courseId));
  const layout = $derived(app.settings.layout);
  const extra = $derived(shows(layout, 'extraStats'));
  const simple = $derived(layout === 'simple');
  const mod = $derived(course?.modules.find((m) => m.id === moduleId));
  const unitNumber = $derived(course && mod ? course.modules.indexOf(mod) + 1 : 0);
  const items = $derived(course ? flattenCourse(course) : []);
  const mastery = $derived(app.mastery[courseId]);
  const percent = $derived(moduleMasteryPercentFor(courseId, moduleId));
  const weakSkillId = $derived(course ? weakestSkillInModule(course, mastery, moduleId) : undefined);
  const pool = $derived(course ? moduleMasteryPool(course, moduleId) : 0);
  const skills = $derived(course ? courseSkills(course) : []);

  const testItem = $derived(mod ? items.find((i) => i.id === testItemId(mod.id)) : undefined);
  const testGate = $derived(gateOf(testItem));

  function examDay(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12).toLocaleDateString(app.settings.uiLanguage === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function flatFor(id: string): FlatItem | undefined {
    return items.find((i) => i.id === id);
  }

  function gateOf(item: FlatItem | undefined): Gate {
    return course && item ? gateForItem(course, mastery, item, cs.gatingMode) : openGate();
  }

  /** Lesson id -> skill id, when that lesson has questions worth a practice set. */
  function practiceSkillOf(lesson: Lesson): string | undefined {
    const skill = skills.find((s) => s.id === lesson.id);
    return skill && skill.questionIds.length > 0 ? skill.id : undefined;
  }

  function questionCount(skillId: string): number {
    return skills.find((s) => s.id === skillId)?.questionIds.length ?? 0;
  }

  function tierOf(skillId: string): MasteryTier {
    return tierForPoints(skillPoints(mastery, skillId));
  }

  /** A started skill that is being forgotten: worth a review soon. */
  function fading(skillId: string): boolean {
    return tierOf(skillId) !== 'not-started' && isFading(mastery, skillId);
  }

  function kindIcon(kind: LessonKind): string {
    return kind === 'video' ? 'play' : kind === 'exercise' ? 'exercise' : 'article';
  }

  function tierName(tier: MasteryTier): string {
    return t('mastery.tier.' + tier);
  }

  function gateText(gate: Gate): string {
    if (!course || gate.kind === 'open') return '';
    const skill = gate.skillId ? skillTitle(course, gate.skillId) : '';
    if (gate.kind === 'module') return t('gate.module', { percent: gate.target });
    if (gate.kind === 'test') return t('gate.test', { tier: tierName(MASTERY.gate.test), skill });
    if (gate.kind === 'exam') return t('gate.exam', { tier: tierName(MASTERY.gate.exam), skill });
    return t('gate.lesson', { tier: tierName(MASTERY.gate.lesson), skill });
  }

  function openItem(id: string) {
    navigate({ name: 'player', courseId, lessonId: id });
    window.scrollTo({ top: 0 });
  }

  function practise(skillId: string) {
    navigate({ name: 'exercise', courseId, skillId });
    window.scrollTo({ top: 0 });
  }

  function practiseWeak() {
    if (!course || !weakSkillId) return;
    const item = itemForSkill(course, weakSkillId);
    if (item) openItem(item.id);
  }

  /** Memory strength of a skill in percent, or null before its first answer. */
  function memoryOf(skillId: string): number | null {
    const r = skillRetention(mastery, skillId);
    return r === undefined ? null : Math.round(r * 100);
  }

  const unitTotals = $derived.by(() => {
    if (!mod) return { lessons: 0, questions: 0, minutes: 0 };
    return {
      lessons: mod.lessons.length,
      questions: mod.lessons.reduce((n, l) => n + lessonQuestionCount(l), 0),
      minutes: mod.lessons.reduce((n, l) => n + readingMinutes(l, cs.explanationLanguage, cs.explanationLevel), 0)
    };
  });

  function openUnit(id: string) {
    navigate({ name: 'unit', courseId, moduleId: id });
    window.scrollTo({ top: 0 });
  }
</script>

{#if !course}
  <main class="cf-page cf-page-narrow cf-empty">
    <h1>{t('unit.noCourse')}</h1>
    <button type="button" class="cf-btn cf-btn-secondary" onclick={() => navigate({ name: 'home' })}>{t('player.back')}</button>
  </main>
{:else if !mod}
  <main class="cf-page cf-page-narrow cf-empty">
    <h1>{t('unit.notFound')}</h1>
    <button type="button" class="cf-btn cf-btn-secondary" onclick={() => navigate({ name: 'home' })}>{t('player.back')}</button>
  </main>
{:else}
  {#snippet unitList()}
    <ol class="cf-unit-list">
      {#each course.modules as unit, index (unit.id)}
        <li>
          <button type="button" class:active={unit.id === mod.id} aria-current={unit.id === mod.id ? 'page' : undefined} onclick={() => openUnit(unit.id)}>
            <span class="cf-unit-number">{t('unit.label', { n: index + 1 })}</span>
            <span class="cf-unit-name">{unit.title}</span>
          </button>
        </li>
      {/each}
    </ol>
  {/snippet}

  <div class="cf-unit-layout">
    <aside class="cf-unit-side" aria-label={t('unit.courseUnits')}>
      <div class="cf-unit-course">
        <span class="cf-course-dot" style:background={courseAccent(course.id)} aria-hidden="true"></span>
        <div>
          <p class="cf-unit-course-title">{displayTitle(course)}</p>
          <p class="cf-unit-course-count">{course.modules.length === 1 ? t('unit.countOne') : t('unit.count', { n: course.modules.length })}</p>
        </div>
      </div>
      {@render unitList()}
    </aside>

    <main class="cf-unit-main">
      <nav class="cf-breadcrumb" aria-label={t('unit.breadcrumb')}>
        <a href="#/home" aria-label={t('unit.home')}><NavIcon name="home" size={16} /></a>
        {#if course.subject}<span aria-hidden="true">•</span><span class="cf-crumb">{course.subject}</span>{/if}
        <span aria-hidden="true">•</span>
        <button type="button" class="cf-link" onclick={() => openUnit(course.modules[0]?.id ?? mod.id)}>{displayTitle(course)}</button>
      </nav>

      <h1 class="cf-unit-title">{t('unit.heading', { n: unitNumber, title: mod.title })}</h1>
      <p class="cf-unit-mastery">{t('unit.masteryLine', { percent })}</p>
      {#if extra}
        <p class="cf-muted cf-small cf-unit-totals">{t('unit.totals', { lessons: unitTotals.lessons, questions: unitTotals.questions, minutes: unitTotals.minutes })}</p>
      {/if}
      <p class="cf-course-settings-link"><a href={'#/settings/' + encodeURIComponent(courseId)}><NavIcon name="settings" size={15} /> {t('course.settings')}</a></p>

      {#if shows(layout, 'masteryLegend')}<MasteryLegend />{/if}

      {#if shows(layout, 'skillRow')}
      <div class="cf-skill-row">
        {#each mod.lessons as lesson (lesson.id)}
          {@const skillId = practiceSkillOf(lesson)}
          {#if skillId}
            {@const label = `${lesson.title}: ${tierName(tierOf(skillId))}${fading(skillId) ? ` (${t('srs.reviewSoon')})` : ''}`}
            <button type="button" class="cf-skill-btn" class:cf-fading={fading(skillId)} onclick={() => practise(skillId)} title={label}>
              <MasteryIcon tier={tierOf(skillId)} {label} />
            </button>
          {/if}
        {/each}
        {#if mod.test}
          <button type="button" class="cf-skill-btn" disabled={testGate.locked} onclick={() => testItem && openItem(testItem.id)} title={t('mastery.legend.test')}>
            <MasteryIcon kind="test" label={t('mastery.legend.test')} />
          </button>
        {/if}
      </div>
      {/if}

      {#if weakSkillId}
        <button type="button" class="cf-btn cf-btn-secondary cf-weak" onclick={practiseWeak}>{t('gate.practiseWeak')}</button>
      {/if}

      <details class="cf-unit-mobile-list">
        <summary>{t('unit.courseUnits')}</summary>
        {@render unitList()}
      </details>

      {#if mod.summary && shows(layout, 'aboutCards')}
        <section class="cf-card">
          <h2>{t('unit.about')}</h2>
          <p>{mod.summary}</p>
        </section>
      {/if}

      {#if mod.lessons.length === 0}
        <p class="cf-muted">{t('unit.noLessons')}</p>
      {/if}

      {#each mod.lessons as lesson (lesson.id)}
        {@const gate = gateOf(flatFor(lesson.id))}
        {@const kind = lessonKind(lesson)}
        {@const skillId = practiceSkillOf(lesson)}
        {#if simple}
          <section class="cf-card cf-lesson-card cf-lesson-simple">
            <div class="cf-lesson-simple-text">
              <h2>{lesson.title}</h2>
              {#if skillId}<p class="cf-small"><MasteryIcon tier={tierOf(skillId)} size={16} /> {tierName(tierOf(skillId))}</p>{/if}
              {#if gate.locked}<p class="cf-gate"><NavIcon name="lock" size={13} /><span>{gateText(gate)}</span></p>{/if}
            </div>
            {#if !gate.locked}
              <div class="cf-lesson-simple-actions">
                <button type="button" class="cf-btn cf-btn-primary cf-btn-big" onclick={() => openItem(lesson.id)}>{t('unit.open')}</button>
                {#if skillId}<button type="button" class="cf-btn cf-btn-secondary cf-btn-big" onclick={() => practise(skillId)}>{t('unit.practiceSkill')}</button>{/if}
              </div>
            {/if}
          </section>
        {:else}
        <section class="cf-card cf-lesson-card">
          <h2>{lesson.title}</h2>
          {#if lesson.goal}<p class="cf-muted">{lesson.goal}</p>{/if}
          {#if extra}
            <p class="cf-small cf-muted">{t('unit.lessonExtra', { minutes: readingMinutes(lesson, cs.explanationLanguage, cs.explanationLevel), n: lessonQuestionCount(lesson) })}</p>
          {/if}

          <h3 class="cf-card-sub">{t('unit.learn')}</h3>
          <div class="cf-learn-row">
            <span class="cf-kind-icon" aria-hidden="true"><NavIcon name={kindIcon(kind)} size={14} /></span>
            {#if gate.locked}
              <span class="cf-locked-title">{lesson.title}</span>
            {:else}
              <button type="button" class="cf-link cf-learn-link" onclick={() => openItem(lesson.id)}>{lesson.title}</button>
            {/if}
            <span class="cf-muted cf-kind-label">{t('unit.type.' + kind)}</span>
          </div>
          {#if gate.locked}
            <p class="cf-gate"><NavIcon name="lock" size={13} /><span>{gateText(gate)} {t('gate.current', { current: gate.current, target: gate.target })}</span></p>
          {:else if gate.recommended}
            <p class="cf-muted cf-small">{t('gate.recommended', { requirement: gateText(gate) })}</p>
          {/if}

          {#if skillId}
            {@const tier = tierOf(skillId)}
            {@const total = questionCount(skillId)}
            <h3 class="cf-card-sub">{t('unit.practice')}</h3>
            <div class="cf-practice-row">
              <MasteryIcon {tier} size={24} />
              <div class="cf-practice-text">
                <span class="cf-practice-title">{lesson.title}</span>
                <span class="cf-muted cf-small">{tierName(tier)}{#if fading(skillId)}<span class="cf-review-soon">{t('srs.reviewSoon')}</span>{/if}</span>
                {#if tier !== 'mastered'}<span class="cf-small cf-levelup">{t('unit.levelUp', { n: questionsToLevelUp(total), m: total })}</span>{/if}
                {#if extra}
                  {@const memory = memoryOf(skillId)}
                  <span class="cf-small cf-muted">{t('unit.skillExtra', { points: skillPoints(mastery, skillId), max: MASTERY.points.mastered })}{#if memory !== null}{', '}{t('unit.memory', { percent: memory })}{/if}</span>
                {/if}
              </div>
              {#if gate.locked}
                <span class="cf-muted cf-small"><NavIcon name="lock" size={13} /> {t('gate.locked')}</span>
              {:else}
                <button type="button" class="cf-btn cf-btn-secondary cf-btn-small" onclick={() => practise(skillId)}>{t('unit.practiceSkill')}</button>
              {/if}
            </div>
          {/if}
        </section>
        {/if}
      {/each}

      {#if mod.test}
        <section class="cf-card cf-test-card">
          <MasteryIcon kind="test" size={32} />
          <div class="cf-test-text">
            <h2>{t('mastery.legend.test')}</h2>
            <p class="cf-muted">{t('mastery.pointsAvailable', { n: pool })}</p>
            {#if testGate.locked}
              <p class="cf-gate"><NavIcon name="lock" size={13} /><span>{gateText(testGate)} {t('gate.current', { current: testGate.current, target: testGate.target })}</span></p>
            {:else if testGate.recommended}
              <p class="cf-muted cf-small">{t('gate.recommended', { requirement: gateText(testGate) })}</p>
            {/if}
          </div>
          {#if !testGate.locked}
            <button type="button" class="cf-btn cf-btn-primary" onclick={() => testItem && openItem(testItem.id)}>{t('unit.testCta')}</button>
          {/if}
        </section>
      {/if}

      {#if cs.showReflect && mod.lessons.some((l) => l.blocks.length > 0)}
        {@const lang = cs.explanationLanguage}
        {#key mod.id}
          <ReflectCard
            scope="unit"
            topic={mod.title}
            points={unitKeyPoints(mod, lang)}
            source={mod.lessons.map((l) => `# ${l.title}\n${lessonDigest(l, lang, 2500)}`).join('\n\n').slice(0, 9000)}
            {lang}
            reflection={app.progress[courseId]?.reflections?.['unit:' + mod.id]}
            onSave={(patch) => saveReflection(courseId, 'unit:' + mod.id, patch)}
          />
        {/key}
      {/if}

      <section class="cf-card cf-test-card cf-challenge-card">
        <MasteryIcon kind="test" size={32} />
        <div class="cf-test-text">
          <h2>{t('challenge.title')}</h2>
          <p class="cf-muted">{t('challenge.cardText')}</p>
        </div>
        <button type="button" class="cf-btn cf-btn-secondary" onclick={() => navigate({ name: 'challenge', courseId })}>{t('challenge.cta')}</button>
      </section>

      <section class="cf-card cf-test-card cf-challenge-card">
        <MasteryIcon kind="test" size={32} />
        <div class="cf-test-text">
          <h2>{t('exam.title')}</h2>
          <p class="cf-muted">{t('exam.cardText')}</p>
          <p class="cf-small">
            {#if app.meta[courseId]?.examDate}{t('plan.examOn', { date: examDay(app.meta[courseId]?.examDate ?? '') })} {/if}
            <a href={'#/settings/' + encodeURIComponent(courseId)}>{app.meta[courseId]?.examDate ? t('plan.change') : t('plan.setDate')}</a>
          </p>
        </div>
        <button type="button" class="cf-btn cf-btn-secondary" onclick={() => navigate({ name: 'exam', courseId })}>{t('exam.cta')}</button>
      </section>
    </main>
  </div>
{/if}
