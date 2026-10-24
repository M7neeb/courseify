<script lang="ts">
  // The header search. It filters the LOCAL library live: typing lists the matching courses and
  // Enter opens the best match (or the Library when nothing matches). No network, no dependency.
  import { app, displayTitle, navigate } from '../core/state.svelte.ts';
  import { courseMatches } from '../core/search.ts';
  import type { Course } from '../core/types.ts';
  import NavIcon from './NavIcon.svelte';
  import { t } from '../i18n/i18n.ts';

  let query = $state('');
  let open = $state(false);

  function tagsOf(course: Course): string[] {
    const tags = app.meta[course.id]?.tags ?? course.meta?.tags ?? [];
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
  }

  const results = $derived.by(() => {
    const trimmed = query.trim();
    if (trimmed === '') return [] as Course[];
    return app.courses
      .filter((course) => !app.meta[course.id]?.archived)
      .filter((course) => courseMatches(course, displayTitle(course), tagsOf(course), trimmed))
      .slice(0, 6);
  });

  const showList = $derived(open && query.trim() !== '');

  function openCourse(course: Course) {
    navigate({ name: 'player', courseId: course.id, lessonId: app.progress[course.id]?.position?.lessonId });
    query = '';
    open = false;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const first = results[0];
    if (first) openCourse(first);
    else navigate({ name: 'library' });
    open = false;
  }
</script>

<form
  class="kh-search-form"
  role="search"
  onsubmit={submit}
  onfocusout={(e) => {
    // Tabbing from the box to a result keeps the list open.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) open = false;
  }}
>
  <label class="sr-only" for="header-search">{t('shell.search')}</label>
  <span class="kh-search-icon" aria-hidden="true"><NavIcon name="search" size={18} /></span>
  <input
    id="header-search"
    type="search"
    autocomplete="off"
    placeholder={t('shell.searchPlaceholder')}
    bind:value={query}
    onfocus={() => (open = true)}
  />
  {#if showList}
    <ul class="kh-results">
      {#each results as course (course.id)}
        <li>
          <button type="button" onmousedown={(event) => event.preventDefault()} onclick={() => openCourse(course)}>
            <span class="kh-result-title">{displayTitle(course)}</span>
            {#if course.subject}<span class="kh-result-sub muted small">{course.subject}</span>{/if}
          </button>
        </li>
      {/each}
      {#if results.length === 0}
        <li class="kh-no-results muted small">{t('library.noSearchResults')}</li>
      {/if}
    </ul>
  {/if}
</form>
