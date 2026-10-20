<script lang="ts">
  // Ready-made courses that come with the app: add one with a click, update it when a newer
  // version ships (progress stays), or open it.
  import { CATALOG, type CatalogEntry } from '../core/catalog.ts';
  import { validateCourse } from '../core/validate.ts';
  import { entryModuleId } from '../core/home.ts';
  import { app, getCourse, navigate, saveCourse, showToast } from '../core/state.svelte.ts';
  import { t } from '../i18n/i18n.ts';

  let { onlyMissing = false, compact = false }: { onlyMissing?: boolean; compact?: boolean } = $props();

  let busy = $state<string | null>(null);
  const entries = $derived(CATALOG.filter((entry) => !onlyMissing || !app.courses.some((c) => c.id === entry.id)));

  function installedVersion(entry: CatalogEntry): string | null {
    const course = app.courses.find((c) => c.id === entry.id);
    return course ? String(course.version ?? '') : null;
  }

  async function add(entry: CatalogEntry, open: boolean) {
    busy = entry.id;
    try {
      const result = validateCourse(await entry.load());
      if (!result.ok || !result.course) throw new Error(result.errors[0]);
      await saveCourse(result.course);
      showToast(t('catalog.added', { title: entry.title }));
      if (open) openCourse(entry.id);
    } catch {
      showToast(t('catalog.failed'));
    } finally {
      busy = null;
    }
  }

  function openCourse(id: string) {
    const course = getCourse(id);
    if (!course) return;
    const moduleId = entryModuleId(course, app.progress[id]);
    navigate(moduleId ? { name: 'unit', courseId: id, moduleId } : { name: 'player', courseId: id });
    window.scrollTo({ top: 0 });
  }
</script>

{#if entries.length > 0}
  <section class="cf-catalog" class:compact aria-labelledby="catalog-title">
    <h2 id="catalog-title">{t('catalog.title')}</h2>
    {#if !compact}<p class="muted small cf-hint">{t('catalog.hint')}</p>{/if}
    <ul>
      {#each entries as entry (entry.id)}
        {@const installed = installedVersion(entry)}
        <li class="cf-catalog-item">
          <div class="cf-catalog-text">
            <p class="cf-catalog-subject">{entry.subject}, {t('catalog.lessons', { n: entry.lessons })}</p>
            <h3>{entry.title}</h3>
            <p class="muted">{entry.summary}</p>
          </div>
          <div class="cf-catalog-actions">
            {#if installed === null}
              <button type="button" class="btn primary" disabled={busy !== null} onclick={() => add(entry, true)}>{busy === entry.id ? t('catalog.adding') : t('catalog.add')}</button>
            {:else}
              <button type="button" class="btn primary" onclick={() => openCourse(entry.id)}>{t('catalog.open')}</button>
              {#if installed !== entry.version}
                <button type="button" class="btn" disabled={busy !== null} onclick={() => add(entry, false)}>{busy === entry.id ? t('catalog.adding') : t('catalog.update')}</button>
              {:else}
                <span class="muted small">{t('catalog.installed')}</span>
              {/if}
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}
