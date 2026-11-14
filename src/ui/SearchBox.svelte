<script lang="ts">
  // The header search. It looks through the LOCAL library live: typing lists the matching courses
  // and the lessons that mention the words. Enter opens the best match (or the Library when
  // nothing matches). No network, no dependency.
  import { app, displayTitle, navigate } from '../core/state.svelte.ts';
  import { courseMatches, searchLessons, type LessonHit } from '../core/search.ts';
  import type { Course } from '../core/types.ts';
  import NavIcon from './NavIcon.svelte';
  import { t } from '../i18n/i18n.ts';

  // Two boxes can be on the page (header and phone menu), so each needs its own field id.
  let { id = 'header-search' }: { id?: string } = $props();

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

  const lessons = $derived.by(() => {
    if (!open) return [] as LessonHit[];
    return searchLessons(app.courses.filter((course) => !app.meta[course.id]?.archived), query, 6);
  });

  const showList = $derived(open && query.trim() !== '');

  function courseTitle(courseId: string): string {
    const course = app.courses.find((c) => c.id === courseId);
    return course ? displayTitle(course) : '';
  }

  function openLesson(hit: LessonHit) {
    navigate({ name: 'player', courseId: hit.courseId, lessonId: hit.lessonId });
    query = '';
    open = false;
  }

  function openCourse(course: Course) {
    navigate({ name: 'player', courseId: course.id, lessonId: app.progress[course.id]?.position?.lessonId });
    query = '';
    open = false;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const first = results[0];
    if (first) openCourse(first);
    else if (lessons[0]) openLesson(lessons[0]);
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
  <label class="sr-only" for={id}>{t('shell.search')}</label>
  <span class="kh-search-icon" aria-hidden="true"><NavIcon name="search" size={18} /></span>
  <input
    {id}
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
      {#if lessons.length > 0}
        <li class="kh-results-head" role="presentation">{t('shell.searchLessons')}</li>
        {#each lessons as hit (hit.courseId + '/' + hit.lessonId)}
          <li>
            <button type="button" onmousedown={(event) => event.preventDefault()} onclick={() => openLesson(hit)}>
              <span class="kh-result-title">{hit.title}</span>
              <span class="kh-result-sub muted small">{courseTitle(hit.courseId)}</span>
              {#if hit.snippet}<span class="kh-result-snippet small">{hit.snippet}</span>{/if}
            </button>
          </li>
        {/each}
      {/if}
      {#if results.length === 0 && lessons.length === 0}
        <li class="kh-no-results muted small">{t('shell.searchNothing')}</li>
      {/if}
    </ul>
  {/if}
</form>
