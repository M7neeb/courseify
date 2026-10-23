<script lang="ts">
  import { app, getCourse, navigate, restoreBackup, saveCourse, showToast } from '../../core/state.svelte.ts';
  import { analyzeImport, applyFinalExam, applyModule, applyQuestions, type ImportAnalysis } from '../../core/import.ts';
  import { clearReports } from '../../core/state.svelte.ts';
  import { flattenCourse } from '../../core/course-utils.ts';
  import type { Course } from '../../core/types.ts';
  import { copyText } from '../../ui/clipboard.ts';
  import { t } from '../../i18n/i18n.ts';

  let text = $state('');
  // $state.raw: the parsed course must stay a plain object so it can be saved to IndexedDB.
  let analysis = $state.raw<ImportAnalysis | null>(null);
  let targetId = $state('');
  let mergeErrors = $state<string[]>([]);
  let copied = $state(false);
  let done = $state<{ courseId?: string; message: string } | null>(null);

  const errors = $derived(analysis?.kind === 'error' ? analysis.errors : mergeErrors);
  const warnings = $derived(analysis && analysis.kind !== 'error' ? analysis.warnings : []);

  function check() {
    done = null;
    mergeErrors = [];
    analysis = analyzeImport(text);
    if (analysis.kind === 'module' || analysis.kind === 'exam' || analysis.kind === 'questions') {
      const hinted = analysis.courseId && getCourse(analysis.courseId) ? analysis.courseId : undefined;
      targetId = hinted ?? app.courses[0]?.id ?? '';
    }
  }

  async function onFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    text = await file.text();
    input.value = '';
    check();
  }

  async function commit() {
    if (!analysis || analysis.kind === 'error') return;
    mergeErrors = [];
    if (analysis.kind === 'course') {
      const exists = getCourse(analysis.course.id) !== undefined;
      if (exists && !confirm(t('import.overwrite'))) return;
      await saveCourse(analysis.course);
      done = { courseId: analysis.course.id, message: t('import.success', { title: analysis.course.title }) };
    } else if (analysis.kind === 'module') {
      const found = getCourse(targetId);
      if (!found) return;
      const target = $state.snapshot(found) as Course;
      const merged = applyModule(target, analysis.module);
      if (!merged.ok || !merged.course) {
        mergeErrors = merged.errors;
        return;
      }
      await saveCourse(merged.course);
      done = { courseId: target.id, message: t('import.moduleDone', { title: analysis.module.title }) };
    } else if (analysis.kind === 'questions') {
      const found = getCourse(targetId);
      if (!found) return;
      const target = $state.snapshot(found) as Course;
      const merged = applyQuestions(target, analysis.questions);
      if (!merged.ok || !merged.course) {
        mergeErrors = merged.errors;
        return;
      }
      await saveCourse(merged.course);
      await clearReports(target.id, analysis.questions.map((q) => q.id));
      done = { courseId: target.id, message: t('import.questionsDone', { n: analysis.questions.length, title: target.title }) };
    } else if (analysis.kind === 'exam') {
      const found = getCourse(targetId);
      if (!found) return;
      const target = $state.snapshot(found) as Course;
      const merged = applyFinalExam(target, analysis.exam);
      if (!merged.ok || !merged.course) {
        mergeErrors = merged.errors;
        return;
      }
      await saveCourse(merged.course);
      done = { courseId: target.id, message: t('import.examDone', { title: target.title }) };
    } else {
      if (!confirm(t('import.backupConfirm'))) return;
      await restoreBackup(analysis.backup);
      done = { message: t('import.backupDone') };
    }
    showToast(done.message);
    text = '';
    analysis = null;
  }

  async function copyErrors() {
    copied = await copyText(errors.join('\n'));
    setTimeout(() => (copied = false), 2000);
  }
</script>

<section class="stack">
  <h1>{t('import.title')}</h1>
  <p class="lead">{t('import.intro')}</p>

  <div class="row">
    <label class="btn file-button">
      {t('import.pickFile')}
      <input type="file" accept=".json,application/json,.cpack" onchange={onFile} hidden />
    </label>
  </div>

  <label for="import-text">{t('import.paste')}</label>
  <textarea id="import-text" rows="10" bind:value={text} spellcheck="false" placeholder={'{ "schemaVersion": 1, ... }'}></textarea>
  <div class="row">
    <button type="button" class="btn primary" disabled={text.trim() === ''} onclick={check}>{t('import.check')}</button>
  </div>

  {#if errors.length > 0}
    <div class="notice bad" role="alert">
      <h2>{t('import.errors')}</h2>
      <ul>
        {#each errors as e (e)}<li>{e}</li>{/each}
      </ul>
      <button type="button" class="btn" onclick={copyErrors}>{copied ? t('common.copied') : t('import.copyErrors')}</button>
      <p class="muted small">{t('import.fixHint')}</p>
    </div>
  {/if}

  {#if analysis && analysis.kind !== 'error'}
    <div class="notice good">
      {#if analysis.kind === 'course'}
        {@const lessons = flattenCourse(analysis.course).length}
        <h2>{analysis.course.title}</h2>
        <p>{t('import.courseSummary', { modules: analysis.course.modules.length, lessons })}</p>
        {#if getCourse(analysis.course.id)}<p>{t('import.willReplace')}</p>{/if}
      {:else if analysis.kind === 'module' || analysis.kind === 'exam' || analysis.kind === 'questions'}
        <h2>{analysis.kind === 'module' ? analysis.module.title : analysis.kind === 'questions' ? t('import.questionsFound', { n: analysis.questions.length }) : t('import.examFound')}</h2>
        {#if app.courses.length === 0}
          <p>{t('import.noCourses')}</p>
        {:else}
          <label for="module-target">{analysis.kind === 'module' ? t('import.moduleTarget') : t('import.examTarget')}</label>
          <select id="module-target" bind:value={targetId}>
            {#each app.courses as c (c.id)}<option value={c.id}>{c.title}</option>{/each}
          </select>
        {/if}
      {:else}
        <h2>{t('import.backupFound', { n: analysis.backup.courses.length })}</h2>
      {/if}

      {#if warnings.length > 0}
        <details>
          <summary>{t('import.warnings', { n: warnings.length })}</summary>
          <ul>
            {#each warnings as w (w)}<li>{w}</li>{/each}
          </ul>
        </details>
      {/if}

      <button type="button" class="btn primary" disabled={(analysis.kind === 'module' || analysis.kind === 'exam' || analysis.kind === 'questions') && !targetId} onclick={commit}>
        {analysis.kind === 'backup' ? t('import.backupRestore') : t('import.confirm')}
      </button>
    </div>
  {/if}

  {#if done}
    <div class="notice good" role="status">
      <p>{done.message}</p>
      {#if done.courseId}
        <button type="button" class="btn primary" onclick={() => navigate({ name: 'player', courseId: done!.courseId! })}>{t('library.open')}</button>
      {/if}
      <button type="button" class="btn" onclick={() => navigate({ name: 'library' })}>{t('nav.library')}</button>
    </div>
  {/if}
</section>
