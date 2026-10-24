<script lang="ts">
  // Home ("My courses"): a streak bar under the header, a grey profile
  // band, then the learner sidebar beside a two-column grid of course groups. Each group lists its
  // units on a timeline with the unit's mastery line, and the unit the learner is in gets Resume.
  // The data model calls units `modules`; the UI says units.
  import { today as clock } from '../../core/today.svelte.ts';
  import { app, displayTitle, moduleMasteryPercentFor, navigate } from '../../core/state.svelte.ts';
  import { computeStats, dayKey } from '../../core/activity.ts';
  import { tierForPoints } from '../../core/mastery.ts';
  import {
    courseAccent,
    entryModuleId,
    greetingFor,
    homeBadges,
    moduleStatus,
    skillsProgress,
    streakWeeks,
    type ModuleStatus
  } from '../../core/home.ts';
  import { indexQuestions } from '../../core/mistakes.ts';
  import { shows } from '../../core/layout.ts';
  import { dueCards, examBoost, reviewedToday, todayQueue, type ExamFocus } from '../../core/srs.ts';
  import type { Course, Module } from '../../core/types.ts';
  import LearnerNav from '../../ui/LearnerNav.svelte';
  import Celebrate from '../../ui/Celebrate.svelte';
  import MasteryIcon from '../../ui/MasteryIcon.svelte';
  import NavIcon from '../../ui/NavIcon.svelte';
  import CourseCatalog from '../../ui/CourseCatalog.svelte';
  import WeekCard from '../../ui/WeekCard.svelte';
  import { onMount } from 'svelte';
  import { examPlan, weekStart } from '../../core/goals.ts';
  import { dismissReport, goals, syncMilestones, syncWeek } from '../../core/goalsStore.svelte.ts';
  import { previousDay } from '../../core/activity.ts';
  import { t } from '../../i18n/i18n.ts';

  /** Unit rows shown before "See all" reveals the rest. */
  const MODULE_LIMIT = 5;

  const layout = $derived(app.settings.layout);
  const today = $derived(dayKey(new Date(clock.now)));
  const stats = $derived(computeStats(app.activity, today, app.settings.restDays));
  const greeting = $derived(greetingFor(today, stats.streak));
  const weeks = $derived(streakWeeks(stats.streak));

  const displayName = $derived(app.settings.profileName.trim() || t('profile.defaultName'));
  const initials = $derived(
    displayName.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toLocaleUpperCase()
  );
  const username = $derived((app.settings.username ?? '').trim());
  const bio = $derived((app.settings.bio ?? '').trim());

  const activeCourses = $derived(app.courses.filter((course) => !app.meta[course.id]?.archived));
  const courses = $derived.by(() =>
    [...activeCourses].sort(
      (a, b) =>
        (app.progress[b.id]?.lastOpened ?? '').localeCompare(app.progress[a.id]?.lastOpened ?? '') ||
        displayTitle(a).localeCompare(displayTitle(b), app.settings.uiLanguage)
    )
  );
  const skills = $derived(skillsProgress(activeCourses, app.mastery));
  const badges = $derived(
    homeBadges({
      streak: stats.streak,
      level: stats.level,
      activeDays: stats.activeDays,
      courses: activeCourses,
      mastery: app.mastery
    })
  );
  const masteredCount = $derived(badges.find((badge) => badge.id === 'mastered')?.count ?? 0);
  const familiarCount = $derived(badges.find((badge) => badge.id === 'familiar')?.count ?? 0);

  // Exam plans for courses with an exam date, soonest first.
  const plans = $derived(
    activeCourses
      .map((course) => ({ course, plan: examPlan(course, app.progress[course.id], app.meta[course.id]?.examDate, today, app.mastery[course.id]) }))
      .filter((p): p is { course: Course; plan: NonNullable<typeof p.plan> } => p.plan !== null)
      .sort((a, b) => a.plan.daysLeft - b.plan.daysLeft)
  );
  // Today: the reviews that are due (capped per day) and the course to carry on with.
  const today_ = $derived.by(() => {
    const now = new Date(clock.now);
    const indexes = new Map(activeCourses.map((course) => [course.id, indexQuestions(course)]));
    const due = dueCards(activeCourses, app.mastery, (courseId, qid) => indexes.get(courseId)?.has(qid) === true, now, focus);
    return todayQueue(due, reviewedToday(app.mastery, now), app.settings.dailyReviewLimit, examBoost(due, focus));
  });
  // The course with the nearest exam comes first: its reviews and its next lesson.
  const focus = $derived<ExamFocus[]>(plans.map((p) => ({ courseId: p.course.id, daysLeft: p.plan.daysLeft })));
  const continueCourse = $derived(plans.find((p) => p.plan.phase === 'learn')?.course ?? courses[0]);
  // Daily goal, in energy points (XP) earned today. Kept separate from the streak on purpose.
  const goal = $derived(app.settings.dailyGoal);
  const todayXp = $derived(app.activity[today]?.xp ?? 0);
  const goalPercent = $derived(goal > 0 ? Math.min(100, Math.round((todayXp / goal) * 100)) : 0);

  onMount(() => {
    void syncWeek();
    void syncMilestones();
  });

  // Last week's report, shown until it is put away.
  const lastWeek = $derived(weekStart(previousDay(weekStart(today))));
  const report = $derived(
    goals.weekly.lastReport && goals.weekly.lastReport.week === lastWeek && goals.weekly.dismissed !== lastWeek && goals.weekly.lastReport.xp > 0
      ? goals.weekly.lastReport
      : null
  );

  function openCourse(course: Course) {
    const moduleId = entryModuleId(course, app.progress[course.id]);
    if (moduleId) navigate({ name: 'unit', courseId: course.id, moduleId });
    else navigate({ name: 'player', courseId: course.id });
    window.scrollTo({ top: 0 });
  }

  function examDay(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12).toLocaleDateString(app.settings.uiLanguage === 'de' ? 'de-DE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function continueOn() {
    const course = continueCourse;
    if (!course) return;
    const moduleId = entryModuleId(course, app.progress[course.id]);
    if (moduleId) navigate({ name: 'unit', courseId: course.id, moduleId });
    else navigate({ name: 'player', courseId: course.id });
    window.scrollTo({ top: 0 });
  }

  let expanded = $state<Record<string, boolean>>({});

  function openModule(course: Course, module: Module) {
    navigate({ name: 'unit', courseId: course.id, moduleId: module.id });
    window.scrollTo({ top: 0 });
  }

  function modulesOf(course: Course): Module[] {
    return expanded[course.id] || shows(layout, 'allUnits') ? course.modules : course.modules.slice(0, MODULE_LIMIT);
  }

  /** The unit to carry on with in a course, for the big course cards of the Simple layout. */
  function entryModule(course: Course): { module: Module; index: number } | undefined {
    const id = entryModuleId(course, app.progress[course.id]);
    const index = course.modules.findIndex((m) => m.id === id);
    return index >= 0 ? { module: course.modules[index]!, index } : undefined;
  }

  function coursePercent(course: Course): number {
    if (course.modules.length === 0) return 0;
    const sum = course.modules.reduce((acc, m) => acc + moduleMasteryPercentFor(course.id, m.id), 0);
    return Math.round(sum / course.modules.length);
  }

  function statusText(status: ModuleStatus): string {
    return status.tierKey ? t(status.key, { percent: status.percent, tier: t(status.tierKey) }) : '';
  }
</script>

{#if shows(layout, 'streakBar')}
<div class="cf-streakbar">
  <div class="cf-container cf-streakbar-inner">
    <p class="cf-streak-greeting">{t(greeting.key, greeting.vars)}</p>
    <div class="cf-streak-stats">
      <span class="cf-streak-count">
        <span class="cf-flame"><NavIcon name="flame" size={22} /></span>
        <strong>{weeks}</strong>
        <span class="cf-streak-unit">{t('home.weekStreakUnit')}</span>
      </span>
      <span class="cf-level">
        <span class="cf-level-label">
          {t('home.level', { n: stats.level })}
          <span class="cf-info" title={t('home.levelInfo', { n: stats.xpToNext ?? 0 })} aria-label={t('home.levelInfo', { n: stats.xpToNext ?? 0 })}>i</span>
        </span>
        <span class="cf-level-row">
          <span class="cf-progress" role="progressbar" aria-valuenow={skills.done} aria-valuemin="0" aria-valuemax={Math.max(1, skills.total)}>
            <span style:width={skills.percent + '%'}></span>
          </span>
          <span class="cf-level-skills">{t('home.skills', { done: skills.done, total: skills.total })}</span>
        </span>
      </span>
    </div>
  </div>
</div>

{/if}

{#if shows(layout, 'profileBand')}
<div class="cf-profile-band">
  <div class="cf-container cf-profile-inner">
    <span class="cf-avatar" style:background={app.settings.profileColor}>{initials}</span>
    <div class="cf-identity">
      <h1>{displayName}</h1>
      <p>
        <button type="button" class="cf-link-plain" onclick={() => navigate({ name: 'profile' })}>{username || t('home.pickUsername')}</button>
        <span aria-hidden="true"> - </span>
        <button type="button" class="cf-link-underline" onclick={() => navigate({ name: 'profile' })}>{bio || t('home.addBio')}</button>
      </p>
    </div>
    <div class="cf-profile-side">
      <button type="button" class="cf-btn cf-btn-secondary" onclick={() => navigate({ name: 'profile' })}>{t('home.editProfile')}</button>
      <div class="cf-profile-stats">
        <span class="cf-points" title={t('home.energyPoints')}>{stats.totalXp.toLocaleString(app.settings.uiLanguage)}</span>
        <span class="cf-stat" title={t('mastery.tier.mastered')}><MasteryIcon tier="mastered" size={16} />{masteredCount}</span>
        <span class="cf-stat" title={t('home.badge.familiar')}><MasteryIcon tier="familiar" size={16} />{familiarCount}</span>
      </div>
    </div>
  </div>
</div>

{/if}

<div class="cf-page cf-with-nav">
  <LearnerNav />
  <main class="cf-main">
    {#if !shows(layout, 'streakBar')}
      <p class="cf-simple-greeting">{t(greeting.key, greeting.vars)}{#if stats.streak > 0}<span class="cf-simple-streak"><NavIcon name="flame" size={18} />{t('home.simpleStreak', { n: stats.streak })}</span>{/if}</p>
    {/if}
    <div class="cf-section-head">
      <h1>{t('home.myCourses')}</h1>
      {#if courses.length > 0}
        <button type="button" class="cf-btn cf-btn-primary" onclick={() => navigate({ name: 'library' })}>{t('home.editCourses')}</button>
      {/if}
    </div>

    {#if courses.length > 0}
      {#if goal > 0 && todayXp >= goal && app.settings.celebrations}
        <Celebrate message={t('home.goalReached', { n: goal })} />
      {/if}
      <section class="cf-card cf-today" aria-labelledby="home-today">
        <div class="cf-today-text">
          <h2 id="home-today">{t('home.today')}</h2>
          {#if today_.cards.length > 0}
            <p>{today_.cards.length === 1 ? t('review.dueOne') : t('review.dueMany', { n: today_.cards.length })}</p>
          {:else}
            <p>{t('home.todayNoReviews')}</p>
          {/if}
          {#if continueCourse}<p class="cf-muted cf-small">{t('home.todayContinue', { course: displayTitle(continueCourse) })}</p>{/if}
          {#if app.settings.habitCue}
            <p class="cf-small cf-habit">{t('home.habitPlan', { cue: app.settings.habitCue })}</p>
          {:else}
            <p class="cf-muted cf-small"><a href="#/settings">{t('home.habitMake')}</a></p>
          {/if}
          {#if stats.freezes > 0}<p class="cf-muted cf-small">{t(stats.freezes === 1 ? 'home.freezeOne' : 'home.freezeMany', { n: stats.freezes })}</p>{/if}
          {#if goal > 0}
            <div class="cf-goal">
              <span class="cf-progress" role="progressbar" aria-valuenow={Math.min(todayXp, goal)} aria-valuemin="0" aria-valuemax={goal} aria-label={t('home.goal')}>
                <span style:width={goalPercent + '%'}></span>
              </span>
              <span class="cf-small">{t('home.goalProgress', { xp: Math.min(todayXp, goal), goal })}</span>
            </div>
          {/if}
        </div>
        <div class="cf-today-actions">
          {#if today_.cards.length > 0}
            <button type="button" class="cf-btn cf-btn-primary" onclick={() => navigate({ name: 'review' })}>{t('home.todayReview')}</button>
          {/if}
          {#if continueCourse}
            <button type="button" class="cf-btn" class:cf-btn-primary={today_.cards.length === 0} class:cf-btn-secondary={today_.cards.length > 0} onclick={continueOn}>{t('home.todayContinueCta')}</button>
          {/if}
        </div>
      </section>
      {#each plans as { course, plan } (course.id)}
        <section class="cf-card cf-plan" aria-label={t('plan.cardLabel', { course: displayTitle(course) })}>
          <div class="cf-plan-text">
            <p class="cf-plan-when">{plan.daysLeft === 0 ? t('plan.today') : plan.daysLeft === 1 ? t('plan.tomorrow') : t('plan.inDays', { n: plan.daysLeft })}</p>
            <h2>{displayTitle(course)}</h2>
            <p class="cf-muted cf-small">{examDay(plan.examDate)}</p>
            <div class="cf-goal">
              <span class="cf-progress" role="progressbar" aria-valuenow={plan.readiness} aria-valuemin="0" aria-valuemax="100" aria-label={t('plan.readiness')}>
                <span style:width={plan.readiness + '%'}></span>
              </span>
              <span class="cf-small">{t('plan.readinessValue', { n: plan.readiness })}</span>
            </div>
            <p>
              {#if plan.phase === 'learn'}
                {t(plan.lessonsPerDay === 1 ? 'plan.learnOne' : 'plan.learnMany', { n: plan.lessonsPerDay, left: plan.lessonsLeft })}
              {:else if plan.phase === 'review'}
                {t('plan.review')}
              {:else if plan.phase === 'last'}
                {t('plan.last')}
              {:else}
                {t('plan.good')}
              {/if}
            </p>
          </div>
          <div class="cf-today-actions">
            {#if plan.phase === 'learn'}
              <button type="button" class="cf-btn cf-btn-secondary" onclick={() => openCourse(course)}>{t('plan.continue')}</button>
            {/if}
            {#if plan.phase !== 'today'}
              <button type="button" class="cf-btn" class:cf-btn-primary={plan.phase !== 'learn'} class:cf-btn-secondary={plan.phase === 'learn'} onclick={() => navigate({ name: 'exam', courseId: course.id })}>{t('exam.cta')}</button>
            {/if}
          </div>
        </section>
      {/each}

      {#if report}
        <WeekCard {report} title={t('week.lastWeek')} ondismiss={() => dismissReport(report.week)} />
      {/if}

      {#if shows(layout, 'extraStats')}
        <ul class="cf-stat-strip" aria-label={t('home.statsLabel')}>
          <li><strong>{today_.cards.length}</strong><span>{t('home.stat.due')}</span></li>
          <li><strong>{reviewedToday(app.mastery, new Date())}</strong><span>{t('home.stat.reviewed')}</span></li>
          <li><strong>{todayXp}</strong><span>{t('home.stat.xpToday')}</span></li>
          <li><strong>{stats.streak}</strong><span>{t('home.stat.streakDays')}</span></li>
          <li><strong>{skills.done} / {skills.total}</strong><span>{t('home.stat.skills')}</span></li>
          <li><strong>{stats.totalXp.toLocaleString(app.settings.uiLanguage)}</strong><span>{t('home.stat.totalXp')}</span></li>
        </ul>
      {/if}
    {/if}

    {#if courses.length === 0}
      <div class="cf-empty">
        <h2>{t('home.empty')}</h2>
        <p>{t('home.emptyHint')}</p>
        <div class="cf-actions">
          <button type="button" class="cf-btn cf-btn-primary" onclick={() => navigate({ name: 'import' })}>{t('home.import')}</button>
          <button type="button" class="cf-btn cf-btn-secondary" onclick={() => navigate({ name: 'prompt' })}>{t('home.create')}</button>
        </div>
      </div>
    {:else if shows(layout, 'bigCourseCards')}
      <ul class="cf-big-courses">
        {#each courses as course (course.id)}
          {@const entry = entryModule(course)}
          {@const pct = coursePercent(course)}
          <li class="cf-big-course" style:--course-accent={courseAccent(course.id)}>
            <h2>{displayTitle(course)}</h2>
            {#if entry}<p class="cf-muted">{t('unit.heading', { n: entry.index + 1, title: entry.module.title })}</p>{/if}
            <span class="cf-progress cf-progress-wide" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label={t('home.courseMastery', { percent: pct })}><span style:width={pct + '%'}></span></span>
            <p class="cf-small">{t('home.courseMastery', { percent: pct })}</p>
            {#if entry}
              <button type="button" class="cf-btn cf-btn-primary cf-btn-big" onclick={() => openModule(course, entry.module)}>
                {app.progress[course.id] ? t('home.resume') : t('home.start')}
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <div class="cf-course-grid">
        {#each courses as course (course.id)}
          {@const entryId = entryModuleId(course, app.progress[course.id])}
          {@const accent = courseAccent(course.id)}
          <section class="cf-course-group">
            <header>
              <h2>{displayTitle(course)}</h2>
              {#if course.modules.length > MODULE_LIMIT && !shows(layout, 'allUnits')}
                <button type="button" class="cf-link" onclick={() => (expanded[course.id] = !expanded[course.id])}>
                  {expanded[course.id] ? t('home.showLess') : t('home.seeAll', { n: course.modules.length })}
                </button>
              {/if}
            </header>
            {#if course.modules.length === 0}
              <p class="cf-muted">{t('home.noModules')}</p>
            {:else}
              <ol class="cf-timeline">
                {#each modulesOf(course) as module, index (module.id)}
                  {@const percent = moduleMasteryPercentFor(course.id, module.id)}
                  {@const status = moduleStatus(percent, tierForPoints(percent), module.test !== undefined)}
                  <li>
                    <span class="cf-unit-dot" style:background={accent} aria-hidden="true">{index + 1}</span>
                    <div class="cf-unit-text">
                      <button type="button" class="cf-link cf-unit-link" onclick={() => openModule(course, module)}>{module.title}</button>
                      {#if statusText(status)}<span class="cf-unit-status">{statusText(status)}</span>{/if}
                      {#if shows(layout, 'extraStats')}
                        <span class="cf-unit-extra">
                          <span class="cf-progress" aria-hidden="true"><span style:width={percent + '%'}></span></span>
                          <span class="cf-small cf-muted">{t('home.unitExtra', { percent, n: module.lessons.length })}</span>
                        </span>
                      {/if}
                    </div>
                    {#if module.id === entryId}
                      <button type="button" class="cf-btn cf-btn-primary cf-btn-small" onclick={() => openModule(course, module)}>
                        {app.progress[course.id] ? t('home.resume') : t('home.start')}
                      </button>
                    {/if}
                  </li>
                {/each}
              </ol>
            {/if}
          </section>
        {/each}
      </div>
    {/if}
    <CourseCatalog onlyMissing compact />
  </main>
</div>
