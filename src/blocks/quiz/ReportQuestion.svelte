<script lang="ts">
  // "Report a problem" under a question: flag it as wrong, unclear or with a typo, with a note.
  // Reported questions are fixed later, all at once, from the course settings.
  import type { BlockContext, QuestionReport } from '../../core/types.ts';
  import { REPORT_REASONS } from '../../core/reports.ts';
  import { t } from '../../i18n/i18n.ts';

  let { ctx, questionId }: { ctx: BlockContext; questionId: string } = $props();

  let open = $state(false);
  let reason = $state<QuestionReport['reason']>('wrong');
  let note = $state('');
  let reported = $state(false);
  $effect(() => {
    reported = ctx.isReported?.(questionId) ?? false;
  });

  function send() {
    ctx.reportQuestion?.(questionId, { reason, note: note.trim() || undefined, at: new Date().toISOString() });
    reported = true;
    open = false;
  }

  function undo() {
    ctx.reportQuestion?.(questionId, null);
    reported = false;
  }
</script>

{#if ctx.reportQuestion}
  <div class="report-q">
    {#if reported}
      <p class="muted small" role="status">
        {t('report.done')}
        <a href={'#/settings/' + encodeURIComponent(ctx.courseId)}>{t('report.where')}</a>
        <button type="button" class="link small" onclick={undo}>{t('report.undo')}</button>
      </p>
    {:else if open}
      <fieldset class="report-form">
        <legend>{t('report.title')}</legend>
        {#each REPORT_REASONS as r (r)}
          <label class="cf-choice"><input type="radio" name={'report-' + questionId} value={r} bind:group={reason} />{t('report.reason.' + r)}</label>
        {/each}
        <label for={'report-note-' + questionId} class="small">{t('report.note')}</label>
        <textarea id={'report-note-' + questionId} rows="2" bind:value={note}></textarea>
        <div class="row">
          <button type="button" class="btn" onclick={send}>{t('report.send')}</button>
          <button type="button" class="link small" onclick={() => (open = false)}>{t('common.cancel')}</button>
        </div>
      </fieldset>
    {:else}
      <button type="button" class="link small report-link" onclick={() => (open = true)}>{t('report.open')}</button>
    {/if}
  </div>
{/if}
