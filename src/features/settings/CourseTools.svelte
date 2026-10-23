<script lang="ts">
  // Course tools in a course's settings: questions reported as faulty (with one prompt to fix them
  // all) and sharing the course as a file.
  import { app, getCourse, navigate } from '../../core/state.svelte.ts';
  import { fixQuestionsPrompt, reportedQuestions } from '../../core/reports.ts';
  import { shareCourse } from '../../ui/shareCourse.ts';
  import { copyText } from '../../ui/clipboard.ts';
  import type { Course } from '../../core/types.ts';
  import { t } from '../../i18n/i18n.ts';

  let { courseId }: { courseId: string } = $props();

  const course = $derived(getCourse(courseId));
  const reported = $derived(course ? reportedQuestions(course, app.progress[courseId]?.reports) : []);
  let copied = $state(false);
  let shareNote = $state('');

  async function copyFix() {
    if (!course) return;
    copied = await copyText(fixQuestionsPrompt($state.snapshot(course) as Course, $state.snapshot(reported) as typeof reported));
    setTimeout(() => (copied = false), 2500);
  }

  async function share() {
    if (!course) return;
    const data = $state.snapshot(course) as Course;
    const result = await shareCourse(data, t('share.text', { title: data.title }));
    shareNote = result === 'downloaded' ? t('share.downloaded') : '';
  }
</script>

{#if course}
  <fieldset>
    <legend>{t('report.listTitle', { n: reported.length })}</legend>
    {#if reported.length === 0}
      <p class="muted small">{t('report.none')}</p>
    {:else}
      <ol class="report-list">
        {#each reported as r (r.question.id)}
          <li>
            <p class="report-prompt">{r.question.prompt}</p>
            <p class="muted small">{r.where} · {t('report.reason.' + r.report.reason)}{r.report.note ? ` · "${r.report.note}"` : ''}</p>
          </li>
        {/each}
      </ol>
      <ol class="small report-steps">
        <li>{t('report.step1')}</li>
        <li>{t('report.step2')}</li>
        <li>{t('report.step3')}</li>
      </ol>
      <div class="row">
        <button type="button" class="btn primary" onclick={copyFix}>{copied ? t('common.copied') : t('report.copyPrompt')}</button>
        <button type="button" class="btn" onclick={() => navigate({ name: 'import' })}>{t('report.import')}</button>
      </div>
    {/if}
  </fieldset>

  <fieldset>
    <legend>{t('share.title')}</legend>
    <p class="muted small">{t('share.help')}</p>
    <div class="row">
      <button type="button" class="btn" onclick={share}>{t('share.button')}</button>
    </div>
    {#if shareNote}<p class="small" role="status">{shareNote}</p>{/if}
  </fieldset>
{/if}
