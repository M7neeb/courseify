<script lang="ts">
  // The cheat sheet: a course (or one unit) on a few pages, to read before a test or to print.
  // Key points, formulas and warnings per lesson, then the terms. Nothing here is saved.
  import { app, courseSettings, displayTitle, getCourse, navigate } from '../../core/state.svelte.ts';
  import { courseSheet } from '../../core/sheet.ts';
  import { entryModuleId } from '../../core/home.ts';
  import { renderMarkdown } from '../../core/markdown.ts';
  import NavIcon from '../../ui/NavIcon.svelte';
  import { t } from '../../i18n/i18n.ts';

  let { courseId, moduleId }: { courseId: string; moduleId?: string } = $props();

  const course = $derived(getCourse(courseId));
  const lang = $derived(courseSettings(courseId).explanationLanguage);
  const unitId = $derived(moduleId && course?.modules.some((m) => m.id === moduleId) ? moduleId : undefined);
  const sheet = $derived(course ? courseSheet(course, lang, unitId) : null);
  const unitTitle = $derived(unitId ? course?.modules.find((m) => m.id === unitId)?.title : undefined);

  // Inline Markdown only: a key point is one line, and a paragraph tag would add a margin to each.
  const inline = (md: string) => renderMarkdown(md).replace(/^<p>([\s\S]*)<\/p>\s*$/, '$1');

  function pickUnit(id: string) {
    navigate({ name: 'sheet', courseId, ...(id ? { moduleId: id } : {}) });
  }

  function backToCourse() {
    const c = course;
    const target = unitId ?? (c ? entryModuleId(c, app.progress[courseId]) : undefined);
    if (c && target) navigate({ name: 'unit', courseId, moduleId: target });
    else navigate({ name: 'home' });
  }
</script>

<section class="cf-sheet">
  {#if !course || !sheet}
    <div class="cf-empty">
      <h1>{t('exercise.noCourse')}</h1>
      <button type="button" class="cf-btn cf-btn-secondary" onclick={() => navigate({ name: 'home' })}>{t('player.back')}</button>
    </div>
  {:else}
    <nav class="cf-breadcrumb cf-sheet-chrome" aria-label={t('unit.breadcrumb')}>
      <a href="#/home" aria-label={t('unit.home')}><NavIcon name="home" size={16} /></a>
      <span aria-hidden="true">•</span>
      <button type="button" class="cf-link" onclick={backToCourse}>{displayTitle(course)}</button>
    </nav>

    <header class="cf-sheet-head">
      <div>
        <h1>{t('sheet.title')}</h1>
        <!-- On screen the breadcrumb names the course; on paper this line does. -->
        <p class="cf-sheet-course"><span class="cf-print-only">{displayTitle(course)}{#if unitTitle} · {/if}</span>{unitTitle ?? ''}</p>
      </div>
      <div class="cf-sheet-tools cf-sheet-chrome">
        {#if course.modules.length > 1}
          <label>
            <span class="sr-only">{t('sheet.unit')}</span>
            <select value={unitId ?? ''} onchange={(e) => pickUnit(e.currentTarget.value)}>
              <option value="">{t('sheet.allUnits')}</option>
              {#each course.modules as m (m.id)}<option value={m.id}>{m.title}</option>{/each}
            </select>
          </label>
        {/if}
        <button type="button" class="cf-btn cf-btn-primary" onclick={() => window.print()}>{t('sheet.print')}</button>
      </div>
    </header>
    <p class="cf-muted cf-sheet-chrome">{t('sheet.intro')}</p>

    {#each sheet.units as unit (unit.id)}
      <section class="cf-sheet-unit" aria-labelledby={'sheet-' + unit.id}>
        {#if !unitId}<h2 id={'sheet-' + unit.id}>{unit.title}</h2>{:else}<h2 id={'sheet-' + unit.id} class="sr-only">{unit.title}</h2>{/if}
        <div class="cf-sheet-lessons">
          {#each unit.lessons as lesson (lesson.id)}
            <article class="cf-sheet-lesson">
              <h3>{lesson.title}</h3>
              <ul>
                {#each lesson.points as point, i (i)}<li>{@html inline(point)}</li>{/each}
              </ul>
              {#if lesson.formulas.length > 0}
                <ul class="cf-sheet-formulas" aria-label={t('sheet.formulas')}>
                  {#each lesson.formulas as formula, i (i)}<li>{@html inline(formula)}</li>{/each}
                </ul>
              {/if}
              {#each lesson.warnings as warning, i (i)}
                <div class="cf-sheet-warning"><strong>{t('sheet.watchOut')}</strong> {@html inline(warning)}</div>
              {/each}
            </article>
          {/each}
        </div>
      </section>
    {/each}

    {#if sheet.terms.length > 0}
      <section class="cf-sheet-unit" aria-labelledby="sheet-terms">
        <h2 id="sheet-terms">{t('sheet.terms')}</h2>
        <dl class="cf-sheet-terms">
          {#each sheet.terms as entry (entry.term)}
            <div><dt>{entry.term}</dt><dd>{@html inline(entry.definition)}</dd></div>
          {/each}
        </dl>
      </section>
    {/if}
  {/if}
</section>
