<script lang="ts">
  import { entryModuleId, groupBySubject } from '../../core/home.ts';
  import {
    app,
    displayTitle,
    moduleMasteryPercentFor,
    navigate,
    removeCourse,
    renameCourse,
    restoreCourse,
    setArchived,
    setCourseTags,
    showToast,
    updateSettings
  } from '../../core/state.svelte.ts';
  import { courseProgressPercent, flattenCourse } from '../../core/course-utils.ts';
  import { backupStatus } from '../../core/backup.ts';
  import type { Course } from '../../core/types.ts';
  import { lessonQuestionCount, shows } from '../../core/layout.ts';
  import { dueCards } from '../../core/srs.ts';
  import { indexQuestions } from '../../core/mistakes.ts';
  import CourseCatalog from '../../ui/CourseCatalog.svelte';
  import { t } from '../../i18n/i18n.ts';

  const layout = $derived(app.settings.layout);
  const extra = $derived(shows(layout, 'extraStats'));

  /** Extra numbers for the Detailed layout: lessons, questions, mastery and due reviews. */
  function courseExtra(course: Course) {
    const lessons = course.modules.reduce((n, m) => n + m.lessons.length, 0);
    const questions = course.modules.reduce((n, m) => n + m.lessons.reduce((q, l) => q + lessonQuestionCount(l), 0), 0);
    const ids = indexQuestions(course);
    const due = dueCards([course], app.mastery, (_, qid) => ids.has(qid)).length;
    const mastery = course.modules.length === 0 ? 0 : Math.round(course.modules.reduce((n, m) => n + moduleMasteryPercentFor(course.id, m.id), 0) / course.modules.length);
    return { lessons, questions, due, mastery };
  }

  let showArchived = $state(false);
  let searchText = $state('');
  let sortBy = $state<'recent' | 'title' | 'progress'>('recent');
  let editingTagsFor = $state<string | null>(null);
  let tagsDraft = $state('');

  const archivedCount = $derived(app.courses.filter((c) => app.meta[c.id]?.archived).length);
  const visible = $derived.by(() => {
    const query = searchText.trim().toLocaleLowerCase();
    return app.courses
      .filter((course) => showArchived || !app.meta[course.id]?.archived)
      .filter((course) => {
        if (!query) return true;
        const tags = tagsFor(course);
        return [displayTitle(course), course.subject ?? '', course.level ?? '', ...tags]
          .some((value) => value.toLocaleLowerCase().includes(query));
      })
      .sort((a, b) => {
        if (sortBy === 'title') return displayTitle(a).localeCompare(displayTitle(b), app.settings.uiLanguage);
        if (sortBy === 'progress') return percent(b.id) - percent(a.id) || displayTitle(a).localeCompare(displayTitle(b), app.settings.uiLanguage);
        return (app.progress[b.id]?.lastOpened ?? '').localeCompare(app.progress[a.id]?.lastOpened ?? '');
      });
  });
  const backup = $derived(backupStatus(app.settings.lastBackupAt));
  const continueCourse = $derived(
    [...app.courses]
      .filter((course) => !app.meta[course.id]?.archived && app.progress[course.id]?.position)
      .sort((a, b) => (app.progress[b.id]?.lastOpened ?? '').localeCompare(app.progress[a.id]?.lastOpened ?? ''))[0]
  );

  const backupText = $derived.by(() => {
    if (backup.days === null) return t('backup.last', { when: t('backup.never') });
    if (backup.days === 0) return t('backup.last', { when: t('backup.today') });
    return t('backup.last', { when: t('backup.daysAgo', { n: backup.days }) });
  });

  function percent(courseId: string): number {
    const course = app.courses.find((c) => c.id === courseId);
    return course ? courseProgressPercent(course, app.progress[courseId]?.completedLessons ?? []) : 0;
  }

  function tagsFor(course: Course): string[] {
    const tags = app.meta[course.id]?.tags ?? course.meta?.tags ?? [];
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
  }

  function formatDate(iso: string): string {
    return new Intl.DateTimeFormat(app.settings.uiLanguage, { dateStyle: 'medium' }).format(new Date(iso));
  }

  function rename(id: string, current: string) {
    const name = prompt(t('library.renamePrompt'), current);
    if (name !== null) void renameCourse(id, name);
  }

  function startTagEdit(course: Course) {
    editingTagsFor = course.id;
    tagsDraft = tagsFor(course).join(', ');
  }

  function saveTags(courseId: string) {
    void setCourseTags(courseId, tagsDraft.split(','));
    editingTagsFor = null;
  }

  async function remove(course: Course) {
    if (!confirm(t('library.deleteConfirm'))) return;
    const title = displayTitle(course);
    await removeCourse(course.id);
    showToast(t('toast.deleted', { title }), {
      actionLabel: t('common.undo'),
      onAction: async () => {
        await restoreCourse(course.id);
        showToast(t('toast.restored', { title }));
      }
    });
  }

  // Courses sit under their subject heading.
  const subjectGroups = $derived(groupBySubject(visible, app.settings.uiLanguage));

  function openCourse(courseId: string) {
    const course = app.courses.find((c) => c.id === courseId);
    const moduleId = course ? entryModuleId(course, app.progress[courseId]) : undefined;
    if (moduleId) navigate({ name: 'unit', courseId, moduleId });
    else navigate({ name: 'player', courseId });
  }
</script>

<section class="stack">
  <div class="page-head">
    <div class="page-title-group">
      <h1>{t('library.title')}</h1>
      <p class="muted page-intro">{t(app.courses.length === 1 ? 'library.subtitleOne' : 'library.subtitleMany', { n: app.courses.length })}</p>
    </div>
    <div class="page-head-side">
      {#if archivedCount > 0}
        <label class="check">
          <input type="checkbox" bind:checked={showArchived} />
          {t('library.showArchived', { n: archivedCount })}
        </label>
      {/if}
    </div>
  </div>

  {#if backup.stale && !app.settings.backupReminderDismissed && visible.length > 0}
    <div class="backup-inline" role="status"><span class="backup-mark" aria-hidden="true">!</span><span>{t('backup.warn')} <span class="muted">{backupText}</span></span><button type="button" class="backup-dismiss" aria-label={t('backup.dismiss')} title={t('backup.dismiss')} onclick={() => updateSettings({ backupReminderDismissed: true })}>×</button></div>
  {/if}

  {#if app.courses.length > 0 && shows(layout, 'libraryTools')}
    <div class="library-toolbar">
      <label class="library-search" for="course-search">
        <span class="sr-only">{t('library.search')}</span>
        <input id="course-search" type="search" bind:value={searchText} placeholder={t('library.searchHint')} />
      </label>
      <label class="library-sort" for="course-sort">
        <span>{t('library.sort')}</span>
        <select id="course-sort" bind:value={sortBy}>
          <option value="recent">{t('library.sortRecent')}</option>
          <option value="title">{t('library.sortTitle')}</option>
          <option value="progress">{t('library.sortProgress')}</option>
        </select>
      </label>
    </div>
  {/if}

  {#if visible.length === 0}
    <div class="empty-state">
      {#if searchText.trim()}
        <p class="lead">{t('library.noSearchResults')}</p>
      {:else if archivedCount > 0 && !showArchived}
        <p class="lead">{t('library.noActiveCourses')}</p>
      {:else}
        <p class="lead">{t('library.empty')}</p>
        <p>{t('library.emptyHint')}</p>
        <p class="row">
          <button type="button" class="btn primary" onclick={() => navigate({ name: 'prompt' })}>{t('nav.create')}</button>
          <button type="button" class="btn" onclick={() => navigate({ name: 'import' })}>{t('nav.import')}</button>
        </p>
      {/if}
    </div>
  {:else}
    {#each subjectGroups as group (group.subject)}
    <section class="cf-subject">
    <h2 class="cf-subject-title">{group.subject || t('explore.other')}</h2>
    <ul class="course-list">
      {#each group.courses as course (course.id)}
        {@const pct = percent(course.id)}
        {@const archived = app.meta[course.id]?.archived}
        {@const last = app.progress[course.id]?.lastOpened}
        {@const tags = tagsFor(course)}
        {@const isCurrent = continueCourse?.id === course.id && !searchText.trim() && !showArchived}
        {@const resumeItem = flattenCourse(course).find((item) => item.id === app.progress[course.id]?.position?.lessonId)}
        <li class="course-row" class:archived class:continuing={isCurrent}>
          <div class="course-main">
            <p class="course-subject">{isCurrent ? t('library.continueSection') : course.subject || course.level || t('library.courseLabel')}{#if archived}<span class="course-archived">, {t('library.archived')}</span>{/if}</p>
            <h2>{displayTitle(course)}</h2>
            <p class="muted course-summary">{#if isCurrent && (resumeItem?.title || resumeItem?.moduleTitle)}{resumeItem?.title || resumeItem?.moduleTitle}{', '}{/if}{t(flattenCourse(course).length === 1 ? 'library.partOne' : 'library.partMany', { n: flattenCourse(course).length })}{#if course.level && course.subject}{', '}{course.level}{/if}</p>
            {#if extra}
              {@const x = courseExtra(course)}
              <p class="cf-small cf-library-extra">{t('library.extra', { lessons: x.lessons, questions: x.questions, mastery: x.mastery, due: x.due })}</p>
            {/if}
            {#if tags.length > 0 && shows(layout, 'libraryTools')}
              <div class="course-tags" aria-label={t('library.tags')}>
                {#each tags as tag (tag)}<span class="tag-chip">{tag}</span>{/each}
              </div>
            {/if}
            {#if editingTagsFor === course.id}
              <form class="tag-editor" onsubmit={(event) => { event.preventDefault(); saveTags(course.id); }}>
                <label for={'tags-' + course.id}>{t('library.tags')}</label>
                <input id={'tags-' + course.id} type="text" bind:value={tagsDraft} placeholder={t('library.tagsHint')} />
                <div class="row">
                  <button type="submit" class="btn primary">{t('common.save')}</button>
                  <button type="button" class="btn" onclick={() => (editingTagsFor = null)}>{t('common.cancel')}</button>
                </div>
              </form>
            {/if}
            {#if app.settings.libraryShowProgress}
              <div
                class="progress"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label={t('library.progress', { percent: pct })}
              >
                <span style:width={pct + '%'}></span>
              </div>
              <p class="muted small">{t('library.progress', { percent: pct })}</p>
            {/if}
            {#if (app.settings.libraryShowLastOpened || extra) && last && app.progress[course.id]?.position}
              <p class="muted small course-last-opened">{t('library.lastOpened', { date: formatDate(last) })}</p>
            {/if}
          </div>
          <div class="course-actions">
            <button type="button" class="btn primary" onclick={() => openCourse(course.id)}>
              {app.progress[course.id]?.position ? t('library.continue') : t('library.open')}
            </button>
            <details class="course-more">
              <summary class="btn" aria-label={t('library.moreActions')}>···</summary>
              <div class="course-menu">
                <button type="button" onclick={() => rename(course.id, displayTitle(course))}>{t('library.rename')}</button>
                <button type="button" onclick={() => setArchived(course.id, !archived)}>{archived ? t('library.unarchive') : t('library.archive')}</button>
                <button type="button" onclick={() => startTagEdit(course)}>{t('library.editTags')}</button>
                <button type="button" onclick={() => navigate({ name: 'settings', courseId: course.id })}>{t('course.settings')}</button>
                <button type="button" class="danger-text" onclick={() => remove(course)}>{t('library.delete')}</button>
              </div>
            </details>
          </div>
        </li>
      {/each}
    </ul>
    </section>
    {/each}
  {/if}
  <CourseCatalog />
</section>
