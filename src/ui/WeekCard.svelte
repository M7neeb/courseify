<script lang="ts">
  // A week at a glance: XP per day, what was done, and the skills that grew.
  import { app, getCourse } from '../core/state.svelte.ts';
  import { skillTitle } from '../core/mastery.ts';
  import type { WeekReport } from '../core/goals.ts';
  import { t } from '../i18n/i18n.ts';

  let { report, title, ondismiss }: { report: WeekReport; title: string; ondismiss?: () => void } = $props();

  const max = $derived(Math.max(1, ...report.days.map((d) => d.xp)));
  const locale = $derived(app.settings.uiLanguage === 'de' ? 'de-DE' : 'en-GB');
  function dayName(day: string, style: 'short' | 'long' = 'short'): string {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12).toLocaleDateString(locale, { weekday: style });
  }
  const grown = $derived(
    report.stronger.slice(0, 3).map((s) => {
      const course = getCourse(s.courseId);
      return { name: course ? skillTitle(course, s.skillId) : s.skillId, gain: s.after - s.before };
    })
  );
</script>

<section class="cf-card cf-week" aria-labelledby="cf-week-title">
  <div class="cf-week-head">
    <h2 id="cf-week-title">{title}</h2>
    {#if ondismiss}<button type="button" class="link small" onclick={ondismiss}>{t('week.dismiss')}</button>{/if}
  </div>
  <div class="cf-week-bars" role="img" aria-label={t('week.barsLabel', { xp: report.xp })}>
    {#each report.days as d (d.day)}
      <div class="cf-week-bar">
        <span class="cf-week-fill" class:best={report.bestDay?.day === d.day} style:height={(d.xp / max) * 100 + '%'}></span>
        <span class="cf-week-day">{dayName(d.day)}</span>
      </div>
    {/each}
  </div>
  <ul class="cf-week-stats">
    <li><strong>{report.xp}</strong> {t('week.xp')}</li>
    <li><strong>{report.correct}</strong> {t('week.correct')}</li>
    <li><strong>{report.lessons}</strong> {t('week.lessons')}</li>
    <li><strong>{report.activeDays}</strong> {t('week.days')}</li>
  </ul>
  {#if report.bestDay}<p class="cf-muted cf-small">{t('week.bestDay', { day: dayName(report.bestDay.day, 'long'), xp: report.bestDay.xp })}</p>{/if}
  {#if report.stronger.length > 0}
    <p class="cf-week-grown-title">{t('week.stronger', { n: report.stronger.length })}</p>
    <ul class="cf-week-grown">
      {#each grown as g, i (i)}<li>{g.name} <span class="cf-muted">+{g.gain}</span></li>{/each}
    </ul>
  {/if}
</section>
