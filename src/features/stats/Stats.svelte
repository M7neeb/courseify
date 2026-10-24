<script lang="ts">
  import { today as clock } from '../../core/today.svelte.ts';
  import { app, navigate } from '../../core/state.svelte.ts';
  import { activityWeeks, computeStats, dayKey, xpForLevel, LEVEL_THRESHOLDS } from '../../core/activity.ts';
  import { focusSkills, measuredSkills, progressBySubject, tierSegments, type MasterySummary } from '../../core/progressView.ts';
  import { combine } from '../../core/progressView.ts';
  import { courseAccent, entryModuleId } from '../../core/home.ts';
  import { skillPoints, tierForPoints } from '../../core/mastery.ts';
  import type { Course } from '../../core/types.ts';
  import { calibration } from '../../core/calibration.ts';
  import { shows } from '../../core/layout.ts';
  import MasteryIcon from '../../ui/MasteryIcon.svelte';
  import MasteryLegend from '../../ui/MasteryLegend.svelte';
  import WeekCard from '../../ui/WeekCard.svelte';
  import Milestones from '../../ui/Milestones.svelte';
  import { onMount } from 'svelte';
  import { goals, syncMilestones, syncWeek, thisWeekReport } from '../../core/goalsStore.svelte.ts';

  onMount(() => {
    void syncWeek();
    void syncMilestones(false);
  });
  import { t } from '../../i18n/i18n.ts';

  const today = $derived(dayKey(new Date(clock.now)));
  const stats = $derived(computeStats(app.activity, today));
  const weeks = $derived(activityWeeks(today));
  const months = $derived.by(() => {
    let previous = '';
    return weeks.map((week) => {
      const date = new Date(`${week[0]}T12:00:00`);
      const month = date.getMonth();
      const label = previous !== String(month) ? new Intl.DateTimeFormat(app.settings.uiLanguage, { month: 'short' }).format(date) : '';
      previous = String(month);
      return label;
    });
  });
  const todayDate = $derived(new Date(`${today}T12:00:00`));
  const weekdayLabels = $derived([
    t('stats.weekdayMon'), t('stats.weekdayTue'), t('stats.weekdayWed'), t('stats.weekdayThu'),
    t('stats.weekdayFri'), t('stats.weekdaySat'), t('stats.weekdaySun')
  ]);

  /** 0 = nothing, 4 = a lot; used for the day squares' shade. */
  function intensity(day: string): number {
    const xp = app.activity[day]?.xp ?? 0;
    if (xp <= 0) return 0;
    if (xp < 20) return 1;
    if (xp < 60) return 2;
    if (xp < 140) return 3;
    return 4;
  }

  const atTopLevel = $derived(stats.level >= LEVEL_THRESHOLDS.length);
  const levelBase = $derived(xpForLevel(stats.level));
  const levelNext = $derived(atTopLevel ? levelBase : xpForLevel(stats.level + 1));
  const levelPercent = $derived(
    atTopLevel ? 100 : Math.round(((stats.totalXp - levelBase) / Math.max(1, levelNext - levelBase)) * 100)
  );

  // ---- mastery: subjects -> courses -> units ----
  const activeCourses = $derived(app.courses.filter((c) => !app.meta[c.id]?.archived));
  const subjects = $derived(progressBySubject(activeCourses, app.mastery, app.settings.uiLanguage));
  const everything = $derived(combine(subjects.map((s) => s.summary)));
  const focus = $derived(focusSkills(activeCourses, app.mastery, 6));

  function titleOf(course: Course): string {
    return app.meta[course.id]?.customTitle || course.title;
  }

  function openCourse(course: Course) {
    const moduleId = entryModuleId(course, app.progress[course.id]);
    if (moduleId) navigate({ name: 'unit', courseId: course.id, moduleId });
    else navigate({ name: 'player', courseId: course.id });
  }

  function openUnit(courseId: string, moduleId: string) {
    navigate({ name: 'unit', courseId, moduleId });
  }

  /** The tier of every measured skill in a unit, in lesson order, for the row of squares. */
  function unitSquares(course: Course, moduleId: string) {
    return measuredSkills(course)
      .filter((skill) => skill.moduleId === moduleId)
      .map((skill) => ({ id: skill.id, title: skill.title ?? skill.id, tier: tierForPoints(skillPoints(app.mastery[course.id], skill.id)) }));
  }

  function proficientUp(summary: MasterySummary): number {
    return summary.counts.proficient + summary.counts.mastered;
  }

  function practise(courseId: string, skillId: string) {
    navigate({ name: 'exercise', courseId, skillId });
  }

  function courseTitleById(id: string): string {
    const course = app.courses.find((c) => c.id === id);
    return course ? titleOf(course) : id;
  }
  const calib = $derived(calibration(Object.values(app.mastery)));
  const deep = $derived(shows(app.settings.layout, 'deepStats'));

  // The newest days are on the right; on a narrow screen start the calendar scrolled there.
  function scrollToEnd(node: HTMLElement) {
    node.scrollLeft = node.scrollWidth;
  }
</script>

{#snippet tierBar(summary: MasterySummary, label: string)}
  <div class="cf-tierbar" role="img" aria-label={label}>
    {#each tierSegments(summary) as segment (segment.tier)}
      {#if segment.percent > 0}
        <span data-tier={segment.tier} style:width={segment.percent + '%'} title={`${t('mastery.tier.' + segment.tier)}: ${segment.count}`}></span>
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet tierCounts(summary: MasterySummary)}
  <ul class="cf-tiercounts">
    {#each ['mastered', 'proficient', 'familiar', 'attempted', 'not-started'] as const as tier (tier)}
      <li title={t('mastery.tier.' + tier)}><MasteryIcon {tier} size={16} /><span>{summary.counts[tier]}</span><span class="sr-only">{t('mastery.tier.' + tier)}</span></li>
    {/each}
  </ul>
{/snippet}

<section class="cf-progress-page">
  <div class="cf-section-head"><h1>{t('stats.title')}</h1></div>

  {#if goals.loaded}
    <WeekCard report={thisWeekReport()} title={t('week.thisWeek')} />
  {/if}

  <div class="cf-stat-grid">
    <div class="cf-stat-tile cf-stat-wide">
      <p class="cf-stat-label">{t('stats.overallMastery')}</p>
      <p class="cf-stat-value">{everything.percent}%</p>
      {@render tierBar(everything, t('stats.overallMastery'))}
      <p class="cf-muted cf-small">{t('stats.masteryPoints', { points: everything.points, max: everything.maxPoints })}</p>
    </div>
    <div class="cf-stat-tile">
      <p class="cf-stat-label">{t('stats.skillsMastered')}</p>
      <p class="cf-stat-value"><MasteryIcon tier="mastered" size={24} /> {everything.counts.mastered}</p>
      <p class="cf-muted cf-small">{t('stats.proficientLine', { n: proficientUp(everything), total: everything.total })}</p>
    </div>
    <div class="cf-stat-tile">
      <p class="cf-stat-label">{t('stats.streak')}</p>
      <p class="cf-stat-value">{stats.streak === 1 ? t('stats.streakDay') : t('stats.streakDays', { n: stats.streak })}</p>
      <p class="cf-muted cf-small">{stats.activeDays === 1 ? t('stats.activeDayLine') : t('stats.activeDaysLine', { n: stats.activeDays })}</p>
    </div>
    <div class="cf-stat-tile">
      <p class="cf-stat-label">{t('stats.level')} {stats.level}</p>
      <p class="cf-stat-value">{stats.totalXp} XP</p>
      <span class="cf-progress cf-progress-full" role="progressbar" aria-valuenow={stats.totalXp} aria-valuemin={levelBase} aria-valuemax={levelNext}>
        <span style:width={levelPercent + '%'}></span>
      </span>
      <p class="cf-muted cf-small">{atTopLevel ? t('stats.maxLevel') : t('stats.toNextLevel', { n: stats.xpToNext ?? 0, level: stats.level + 1 })}</p>
    </div>
  </div>

  {#if deep}
  <section class="cf-prog-section">
    <div class="cf-prog-head">
      <div>
        <h2>{t('stats.bySubject')}</h2>
        <p class="cf-muted cf-small">{t('stats.bySubjectHint')}</p>
      </div>
    </div>
    <MasteryLegend />

    {#if subjects.length === 0}
      <p class="cf-muted">{t('stats.none')}</p>
    {/if}

    {#each subjects as subject (subject.subject)}
      <article class="cf-subject-card">
        <header class="cf-subject-head">
          <div class="cf-subject-name">
            <h3>{subject.subject || t('explore.other')}</h3>
            <span class="cf-muted cf-small">{subject.courses.length === 1 ? t('stats.subjectCourse') : t('stats.subjectCourses', { n: subject.courses.length })}</span>
          </div>
          <span class="cf-percent">{subject.summary.percent}%</span>
        </header>
        {@render tierBar(subject.summary, `${subject.subject || t('explore.other')}: ${subject.summary.percent}%`)}
        {@render tierCounts(subject.summary)}

        <ul class="cf-prog-courses">
          {#each subject.courses as view (view.course.id)}
            <li>
              <details class="cf-prog-course">
                <summary>
                  <span class="cf-course-dot cf-course-dot-small" style:background={courseAccent(view.course.id)} aria-hidden="true"></span>
                  <span class="cf-prog-course-title">{titleOf(view.course)}</span>
                  <span class="cf-prog-course-bar">{@render tierBar(view.summary, `${titleOf(view.course)}: ${view.summary.percent}%`)}</span>
                  <span class="cf-percent cf-percent-small">{view.summary.percent}%</span>
                </summary>
                <div class="cf-prog-units">
                  {#if view.summary.total === 0}
                    <p class="cf-muted cf-small">{t('stats.noSkills')}</p>
                  {:else}
                    {#each view.units as unit, index (unit.moduleId)}
                      {@const squares = unitSquares(view.course, unit.moduleId)}
                      <div class="cf-prog-unit">
                        <button type="button" class="cf-link" onclick={() => openUnit(view.course.id, unit.moduleId)}>
                          {t('unit.heading', { n: index + 1, title: unit.title })}
                        </button>
                        <span class="cf-skill-squares">
                          {#each squares as square (square.id)}
                            <MasteryIcon tier={square.tier} size={18} label={`${square.title}: ${t('mastery.tier.' + square.tier)}`} />
                          {/each}
                        </span>
                        <span class="cf-percent cf-percent-small">{unit.summary.percent}%</span>
                      </div>
                    {/each}
                  {/if}
                  <button type="button" class="cf-btn cf-btn-secondary cf-btn-small" onclick={() => openCourse(view.course)}>{t('library.open')}</button>
                </div>
              </details>
            </li>
          {/each}
        </ul>
      </article>
    {/each}
  </section>
  {/if}

  <section class="cf-prog-section">
    <h2>{t('stats.focus')}</h2>
    <p class="cf-muted cf-small">{t('stats.focusHint')}</p>
    {#if focus.length === 0}
      <p class="cf-card cf-focus-empty">{t('stats.focusEmpty')}</p>
    {:else}
      <ul class="cf-focus-list">
        {#each focus as item (item.courseId + item.skillId)}
          <li>
            <MasteryIcon tier={item.tier} size={24} />
            <div class="cf-focus-text">
              <span class="cf-focus-title">{item.title}</span>
              <span class="cf-muted cf-small">{courseTitleById(item.courseId)}, {t('mastery.tier.' + item.tier)}, {t('stats.points', { points: item.points })}</span>
            </div>
            <button type="button" class="cf-btn cf-btn-primary cf-btn-small" onclick={() => practise(item.courseId, item.skillId)}>{t('stats.practise')}</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if deep}
  <section class="cf-prog-section">
    <h2>{t('stats.calibration')}</h2>
    <p class="cf-muted cf-small">{t('stats.calibrationHint')}</p>
    <ul class="cf-calibration">
      {#each calib.rows as row (row.confidence)}
        <li>
          <span class="cf-calib-label">{t('quiz.confidence.' + row.confidence)}</span>
          <span class="cf-progress cf-calib-bar" role="progressbar" aria-valuenow={row.percent ?? 0} aria-valuemin="0" aria-valuemax="100" aria-label={t('quiz.confidence.' + row.confidence)}>
            <span style:width={(row.percent ?? 0) + '%'}></span>
          </span>
          <span class="cf-small">{row.percent === null ? t('stats.calibrationNone') : t('stats.calibrationRight', { percent: row.percent, n: row.answers })}</span>
        </li>
      {/each}
    </ul>
    <p class="cf-small">{t('stats.calibration.' + calib.advice)}</p>
  </section>

  <section class="cf-prog-section">
    <h2>{t('stats.activity')}</h2>
    <div class="activity-scroll" {@attach scrollToEnd}>
      <div class="activity-chart" role="group" aria-label={t('stats.dayView')}>
        <div class="activity-weekdays" aria-hidden="true">
          {#each weekdayLabels as label, index (index)}<span>{index % 2 === 0 ? label : ''}</span>{/each}
        </div>
        <div class="activity-calendar">
          <div class="activity-months" aria-hidden="true">
            {#each months as month, index (index)}<span style:grid-column={String(index + 1)}>{month}</span>{/each}
          </div>
          <div class="activity-weeks">
            {#each weeks as week (week[0])}
              <div class="activity-week">
                {#each week as day (day)}
                  {@const future = new Date(`${day}T12:00:00`) > todayDate}
                  <span class="day-square" data-level={intensity(day)} title={t('stats.activityTooltip', { date: day, xp: app.activity[day]?.xp ?? 0 })} aria-label={t('stats.activityTooltip', { date: day, xp: app.activity[day]?.xp ?? 0 })} aria-hidden={future}></span>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
    <p class="cf-muted cf-small">{t('stats.legendLess')} <span class="day-square" data-level="1"></span> <span class="day-square" data-level="4"></span> {t('stats.legendMore')}</p>
    {#if stats.activeDays === 0}
      <p class="cf-muted">{t('stats.noActivity')}</p>
    {/if}
  </section>
  {/if}
  {#if goals.milestones.length > 0}
    <Milestones states={goals.milestones} />
  {/if}
</section>
