<script lang="ts">
  // App settings, or one course's own settings when a course id is given (#/settings/<courseId>).
  // In course scope only the learning options show; each one the course sets for itself is marked
  // and can go back to following the app setting.
  import {
    app,
    courseSettings,
    displayTitle,
    exportBackup,
    getCourse,
    navigate,
    resetCourseSettings,
    setExamDate,
    showToast,
    updateCourseSettings,
    updateSettings
  } from '../../core/state.svelte.ts';
  import { downloadJson } from '../../core/download.ts';
  import { entryModuleId } from '../../core/home.ts';
  import { COLOR_THEMES, PALETTES } from '../../core/themes.ts';
  import { backupStatus } from '../../core/backup.ts';
  import { STUDY_STYLES, currentStudyStyle, type StudyStyle } from '../../core/settings.ts';
  import { CHANGELOG, VERSION } from '../../core/version.ts';
  import type { CourseSettingKey, ExplanationLevel, LayoutMode, Settings } from '../../core/types.ts';
  import { t } from '../../i18n/i18n.ts';
  import CourseTools from './CourseTools.svelte';

  let { courseId }: { courseId?: string } = $props();

  const course = $derived(courseId ? getCourse(courseId) : undefined);
  /** The course whose own settings are edited, or null for the app settings. */
  const scope = $derived(course ? course.id : null);
  const s = $derived(courseSettings(scope));
  const own = $derived(scope ? (app.settings.courseOverrides?.[scope] ?? {}) : {});
  const ownCount = $derived(Object.keys(own).length);

  const backup = $derived(backupStatus(app.settings.lastBackupAt));
  const trashCount = $derived(Object.keys(app.trash).length);
  const STYLE_NAMES = Object.keys(STUDY_STYLES) as StudyStyle[];
  const style = $derived(currentStudyStyle(s));
  const LAYOUTS: LayoutMode[] = ['standard', 'simple', 'detailed', 'compact'];

  const customCourses = $derived(
    app.courses
      .map((c) => ({ id: c.id, title: displayTitle(c), n: Object.keys(app.settings.courseOverrides?.[c.id] ?? {}).length }))
      .filter((c) => c.n > 0)
  );

  const backupText = $derived.by(() => {
    if (backup.days === null) return t('backup.last', { when: t('backup.never') });
    if (backup.days === 0) return t('backup.last', { when: t('backup.today') });
    return t('backup.last', { when: t('backup.daysAgo', { n: backup.days }) });
  });

  /** Saves a learning option: to the course in course scope, otherwise to the app settings. */
  function set(patch: Partial<Settings>) {
    if (scope) void updateCourseSettings(scope, patch as Partial<Record<CourseSettingKey, unknown>>);
    else void updateSettings(patch);
  }

  function isOwn(key: CourseSettingKey): boolean {
    return scope !== null && key in own;
  }

  function useApp(keys: CourseSettingKey[]) {
    if (scope) void updateCourseSettings(scope, Object.fromEntries(keys.map((k) => [k, null])));
  }

  function pickScope(value: string) {
    navigate(value ? { name: 'settings', courseId: value } : { name: 'settings' });
  }

  function backToCourse() {
    if (!course) return;
    const moduleId = entryModuleId(course, app.progress[course.id]);
    navigate(moduleId ? { name: 'unit', courseId: course.id, moduleId } : { name: 'player', courseId: course.id });
  }

  async function resetCourse() {
    if (!scope || !course) return;
    await resetCourseSettings(scope);
    showToast(t('settings.courseResetDone', { course: displayTitle(course) }));
  }

  async function backupData() {
    // Stamp the export time first so the downloaded file carries it too.
    await updateSettings({ lastBackupAt: new Date().toISOString() });
    const data = await exportBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`courseify-backup-${stamp}.json`, data);
    showToast(t('settings.backupDone'));
  }
</script>

{#snippet mark(key: CourseSettingKey)}
  {#if isOwn(key)}
    <p class="cf-own-row">
      <span class="cf-own">{t('settings.own')}</span>
      <button type="button" class="link small" onclick={() => useApp([key])}>{t('settings.useApp')}</button>
    </p>
  {/if}
{/snippet}

<section class="stack cf-settings" class:cf-settings-course={scope}>
  <div class="page-head">
    <h1>{course ? t('settings.courseTitle', { course: displayTitle(course) }) : t('settings.title')}</h1>
    <span class="muted small">{t('settings.version', { version: VERSION })}</span>
  </div>

  {#if app.courses.length > 0}
    <div class="cf-scope">
      <label for="settings-scope">{t('settings.scope')}</label>
      <select id="settings-scope" value={scope ?? ''} onchange={(e) => pickScope(e.currentTarget.value)}>
        <option value="">{t('settings.scopeAll')}</option>
        {#each app.courses as c (c.id)}<option value={c.id}>{displayTitle(c)}</option>{/each}
      </select>
      {#if scope}
        <p class="small">{t('settings.courseIntro')}</p>
        <div class="row">
          <button type="button" class="btn" onclick={backToCourse}>{t('settings.backToCourse')}</button>
          {#if ownCount > 0}
            <button type="button" class="btn" onclick={resetCourse}>{t('settings.courseReset', { n: ownCount })}</button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
  {#if courseId && !course}
    <p class="notice">{t('settings.courseMissing')}</p>
  {/if}

  {#if scope}
    <fieldset>
      <legend>{t('plan.examDate')}</legend>
      <label for="exam-date">{t('plan.examDateLabel')}</label>
      <div class="row">
        <input id="exam-date" type="date" value={app.meta[scope]?.examDate ?? ''} onchange={(e) => scope && setExamDate(scope, e.currentTarget.value)} />
        {#if app.meta[scope]?.examDate}
          <button type="button" class="link small" onclick={() => scope && setExamDate(scope, '')}>{t('plan.examDateClear')}</button>
        {/if}
      </div>
      <p class="muted small">{t('plan.examDateHelp')}</p>
    </fieldset>
    <CourseTools courseId={scope} />
  {/if}

  {#if !scope}
    <fieldset>
      <legend>{t('settings.appearance')}</legend>
      <label>{t('settings.theme')}
        <select value={app.settings.theme} onchange={(e) => updateSettings({ theme: e.currentTarget.value as Settings['theme'] })}>
          <option value="system">{t('theme.system')}</option>
          <option value="light">{t('theme.light')}</option>
          <option value="dark">{t('theme.dark')}</option>
        </select>
      </label>
      <div class="theme-picker">
        <span class="theme-picker-label">{t('settings.colorTheme')}</span>
        <div class="theme-choices" role="group" aria-label={t('settings.colorTheme')}>
          {#each COLOR_THEMES as theme (theme)}
            <button type="button" class="theme-choice" aria-pressed={app.settings.colorTheme === theme} onclick={() => updateSettings({ colorTheme: theme })}>
              <span class="theme-swatch" style:background={PALETTES[theme].light.accent}></span>{t('colorTheme.' + theme)}
            </button>
          {/each}
        </div>
      </div>
      <label>{t('settings.fontSize')}: {app.settings.fontSize}px
        <input type="range" min="14" max="24" step="1" value={app.settings.fontSize} oninput={(e) => updateSettings({ fontSize: Number(e.currentTarget.value) })} />
      </label>
      <label class="check">
        <input type="checkbox" checked={app.settings.reduceMotion} onchange={(e) => updateSettings({ reduceMotion: e.currentTarget.checked })} />
        {t('settings.reduceMotion')}
      </label>
      <label>{t('settings.readingFont')}
        <select value={app.settings.readingFont} onchange={(e) => updateSettings({ readingFont: e.currentTarget.value as Settings['readingFont'] })}>
          <option value="default">{t('settings.readingFont.default')}</option>
          <option value="hyperlegible">{t('settings.readingFont.hyperlegible')}</option>
        </select>
      </label>
      <label>{t('settings.lineSpacing')}
        <select value={app.settings.lineSpacing} onchange={(e) => updateSettings({ lineSpacing: e.currentTarget.value as Settings['lineSpacing'] })}>
          <option value="normal">{t('settings.lineSpacing.normal')}</option>
          <option value="relaxed">{t('settings.lineSpacing.relaxed')}</option>
          <option value="loose">{t('settings.lineSpacing.loose')}</option>
        </select>
      </label>
      <label class="check">
        <input type="checkbox" checked={app.settings.glossaryTerms} onchange={(e) => updateSettings({ glossaryTerms: e.currentTarget.checked })} />
        {t('settings.glossaryTerms')}
      </label>
      <label>{t('settings.language')}
        <select value={app.settings.uiLanguage} onchange={(e) => updateSettings({ uiLanguage: e.currentTarget.value as Settings['uiLanguage'] })}>
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </label>
    </fieldset>

    <fieldset>
      <legend>{t('settings.layout')}</legend>
      <p class="muted small cf-hint">{t('settings.layoutHint')}</p>
      <div class="cf-layouts" role="group" aria-label={t('settings.layout')}>
        {#each LAYOUTS as name (name)}
          <button type="button" class="cf-layout-choice" aria-pressed={app.settings.layout === name} onclick={() => updateSettings({ layout: name })}>
            <span class="cf-wire" data-wire={name} aria-hidden="true">
              <i class="w-head"></i><i class="w-side"></i><i class="w-main"><b></b><b></b><b></b><b></b></i><i class="w-tabs"></i>
            </span>
            <span class="cf-layout-name">{t('settings.layout.' + name)}</span>
            <span class="cf-layout-hint">{t('settings.layout.' + name + 'Hint')}</span>
          </button>
        {/each}
      </div>
      <label>{t('settings.screenMode')}
        <select value={app.settings.screenMode} onchange={(e) => updateSettings({ screenMode: e.currentTarget.value as Settings['screenMode'] })}>
          <option value="auto">{t('settings.screenMode.auto')}</option>
          <option value="desktop">{t('settings.screenMode.desktop')}</option>
        </select>
      </label>
      <p class="muted small cf-hint">{t('settings.screenModeHint')}</p>
    </fieldset>
  {/if}

  <fieldset>
    <legend>{t('settings.learning')}</legend>
    <label>{t('settings.explanation')}
      <select value={s.explanationLevel} onchange={(e) => set({ explanationLevel: e.currentTarget.value as ExplanationLevel })}>
        <option value="normal">{t('level.normal')}</option>
        <option value="simple">{t('level.simple')}</option>
        <option value="detailed">{t('level.detailed')}</option>
      </select>
    </label>
    {@render mark('explanationLevel')}
    <label>{t('settings.explanationLanguage')}
      <select value={s.explanationLanguage} onchange={(e) => set({ explanationLanguage: e.currentTarget.value as Settings['explanationLanguage'] })}>
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
    </label>
    {@render mark('explanationLanguage')}
    <label>{t('settings.questionLanguage')}
      <select value={s.questionLanguage} onchange={(e) => set({ questionLanguage: e.currentTarget.value as Settings['questionLanguage'] })}>
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
    </label>
    {@render mark('questionLanguage')}
    <label class="check">
      <input type="checkbox" checked={s.autoplayVideo} onchange={(e) => set({ autoplayVideo: e.currentTarget.checked })} />
      {t('settings.autoplay')}
    </label>
    {@render mark('autoplayVideo')}
    <label>{t('settings.gating')}
      <select value={s.gatingMode} onchange={(e) => set({ gatingMode: e.currentTarget.value as Settings['gatingMode'] })}>
        <option value="locked">{t('settings.gating.locked')}</option>
        <option value="free">{t('settings.gating.free')}</option>
      </select>
    </label>
    {@render mark('gatingMode')}
    <p class="muted small cf-hint">{t('settings.gatingHint')}</p>
  </fieldset>

  <fieldset>
    <legend>{t('settings.howYouLearn')}</legend>
    <p class="muted small cf-hint">{t('settings.learningHint')}</p>
    <div class="cf-study-styles" role="group" aria-label={t('settings.studyStyle')}>
      {#each STYLE_NAMES as name (name)}
        <button type="button" class="theme-choice" aria-pressed={style === name} onclick={() => set(STUDY_STYLES[name])}>{t('settings.style.' + name)}</button>
      {/each}
    </div>
    <p class="muted small">{style ? t('settings.style.' + style + 'Hint') : t('settings.style.custom')}</p>

    <h3 class="settings-sub">{t('settings.memory')}</h3>
    <label>{t('settings.retention')}
      <select value={String(s.desiredRetention)} onchange={(e) => set({ desiredRetention: Number(e.currentTarget.value) })}>
        {#each [0.8, 0.85, 0.9, 0.95] as r (r)}<option value={String(r)}>{t('settings.retention.' + Math.round(r * 100))}</option>{/each}
      </select>
    </label>
    {@render mark('desiredRetention')}
    <p class="muted small cf-hint">{t('settings.retentionHint')}</p>
    {#if !scope}
      <label>{t('settings.dailyReviews')}
        <select value={String(app.settings.dailyReviewLimit)} onchange={(e) => updateSettings({ dailyReviewLimit: Number(e.currentTarget.value) })}>
          {#each [10, 20, 30, 50, 100] as n (n)}<option value={String(n)}>{n}</option>{/each}
        </select>
      </label>
      <p class="muted small cf-hint">{t('settings.dailyReviewsHint')}</p>
    {/if}
    <label class="check">
      <input type="checkbox" checked={s.interleavePractice} onchange={(e) => set({ interleavePractice: e.currentTarget.checked })} />
      {t('settings.interleave')}
    </label>
    {@render mark('interleavePractice')}
    <p class="muted small cf-hint">{t('settings.interleaveHint')}</p>

    <h3 class="settings-sub">{t('settings.questions')}</h3>
    <label class="check">
      <input type="checkbox" checked={s.askConfidence} onchange={(e) => set({ askConfidence: e.currentTarget.checked })} />
      {t('settings.askConfidence')}
    </label>
    {@render mark('askConfidence')}
    <p class="muted small cf-hint">{t('settings.askConfidenceHint')}</p>
    <label class="check">
      <input type="checkbox" checked={s.recallFirst} onchange={(e) => set({ recallFirst: e.currentTarget.checked })} />
      {t('settings.recallFirst')}
    </label>
    {@render mark('recallFirst')}
    <p class="muted small cf-hint">{t('settings.recallFirstHint')}</p>
    <label class="check">
      <input type="checkbox" checked={s.allowHints} onchange={(e) => set({ allowHints: e.currentTarget.checked })} />
      {t('settings.allowHints')}
    </label>
    {@render mark('allowHints')}
    <p class="muted small cf-hint">{t('settings.allowHintsHint')}</p>
    <label class="check">
      <input type="checkbox" checked={s.acceptTypos} onchange={(e) => set({ acceptTypos: e.currentTarget.checked })} />
      {t('settings.acceptTypos')}
    </label>
    {@render mark('acceptTypos')}

    <h3 class="settings-sub">{t('settings.lessons')}</h3>
    <label class="check">
      <input type="checkbox" checked={s.showWarmups} onchange={(e) => set({ showWarmups: e.currentTarget.checked })} />
      {t('settings.showWarmups')}
    </label>
    {@render mark('showWarmups')}
    <p class="muted small cf-hint">{t('settings.showWarmupsHint')}</p>
    <label class="check">
      <input type="checkbox" checked={s.showReflect} onchange={(e) => set({ showReflect: e.currentTarget.checked })} />
      {t('settings.showReflect')}
    </label>
    {@render mark('showReflect')}
    <p class="muted small cf-hint">{t('settings.showReflectHint')}</p>
  </fieldset>

  <fieldset>
    <legend>{t('settings.motivation')}</legend>
    {#if !scope}
      <label>{t('settings.dailyGoal')}
        <select value={String(app.settings.dailyGoal)} onchange={(e) => updateSettings({ dailyGoal: Number(e.currentTarget.value) })}>
          {#each [0, 30, 50, 100, 200] as n (n)}<option value={String(n)}>{n === 0 ? t('settings.dailyGoalOff') : t('settings.dailyGoalXp', { n })}</option>{/each}
        </select>
      </label>
      <p class="muted small cf-hint">{t('settings.dailyGoalHint')}</p>
    {/if}
    <label class="check">
      <input type="checkbox" checked={s.celebrations} onchange={(e) => set({ celebrations: e.currentTarget.checked })} />
      {t('settings.celebrations')}
    </label>
    {@render mark('celebrations')}
    <label class="check">
      <input type="checkbox" checked={s.sounds} onchange={(e) => set({ sounds: e.currentTarget.checked })} />
      {t('settings.sounds')}
    </label>
    {@render mark('sounds')}
    {#if scope}<p class="muted small">{t('settings.globalOnly')}</p>{/if}
  </fieldset>

  {#if !scope}
    <fieldset>
      <legend>{t('settings.courseSection')}</legend>
      <p class="muted small cf-hint">{t('settings.courseSectionHint')}</p>
      {#if customCourses.length === 0}
        <p class="muted small">{t('settings.courseNone')}</p>
      {:else}
        <ul class="cf-course-settings">
          {#each customCourses as c (c.id)}
            <li>
              <span><strong>{c.title}</strong><br /><span class="muted small">{t(c.n === 1 ? 'settings.courseOwnOne' : 'settings.courseOwnMany', { n: c.n })}</span></span>
              <a class="btn" href={'#/settings/' + encodeURIComponent(c.id)}>{t('settings.courseEdit')}</a>
            </li>
          {/each}
        </ul>
      {/if}
    </fieldset>

    <fieldset>
      <legend>{t('settings.library')}</legend>
      <label class="check">
        <input type="checkbox" checked={app.settings.libraryShowProgress} onchange={(e) => updateSettings({ libraryShowProgress: e.currentTarget.checked })} />
        {t('settings.showProgress')}
      </label>
      <label class="check">
        <input type="checkbox" checked={app.settings.libraryShowLastOpened} onchange={(e) => updateSettings({ libraryShowLastOpened: e.currentTarget.checked })} />
        {t('settings.showLastOpened')}
      </label>
    </fieldset>

    <fieldset>
      <legend>{t('settings.data')}</legend>
      <p class="muted">{t('settings.backupHint')}</p>
      <p class="backup-note" class:warn={backup.stale}>{backupText}</p>
      {#if backup.stale}<p class="muted small">{t('backup.warn')}</p>{/if}
      <div class="row">
        <button type="button" class="btn primary" onclick={backupData}>{t('settings.backup')}</button>
        <button type="button" class="btn" onclick={() => navigate({ name: 'trash' })}>
          {t('settings.trashLink')}{#if trashCount > 0} ({trashCount}){/if}
        </button>
      </div>
      <label class="check">
        <input type="checkbox" checked={!app.settings.backupReminderDismissed} onchange={(e) => updateSettings({ backupReminderDismissed: !e.currentTarget.checked })} />
        {t('settings.backupReminder')}
      </label>
      <p class="muted small">{app.persisted ? t('settings.persisted.yes') : t('settings.persisted.no')}</p>
    </fieldset>

    <fieldset>
      <legend>{t('settings.whatsNew')}</legend>
      <ul class="changelog">
        {#each CHANGELOG as entry (entry.version)}
          <li>
            <p class="changelog-head">
              <span class="badge">{entry.version}</span>
              <span class="muted small">{entry.date}</span>
            </p>
            <ul>
              {#each entry.changes as change (change)}<li>{change}</li>{/each}
            </ul>
          </li>
        {/each}
      </ul>
    </fieldset>
  {/if}
</section>
