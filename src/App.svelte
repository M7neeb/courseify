<script lang="ts">
  // The app frame: a header with Explore and Search on the left, the
  // wordmark in the middle and the learner menu on the right. Learner pages (Courses, Review,
  // Progress, …) sit beside the "My stuff / My account" sidebar; course pages (unit, lesson,
  // exercise) get the dark header and their own course sidebar. On phones both sidebars move into
  // the menu drawer.
  import { onMount } from 'svelte';
  import { app, dismissToast, initApp, runToastAction } from './core/state.svelte.ts';
  import { themeCss } from './core/themes.ts';
  import { startSync } from './ui/sync/sync.svelte.ts';
  import Library from './features/library/Library.svelte';
  import Player from './features/player/Player.svelte';
  import ImportPanel from './features/import-export/ImportPanel.svelte';
  import PromptBuilder from './features/prompt-builder/PromptBuilder.svelte';
  import Settings from './features/settings/Settings.svelte';
  import Stats from './features/stats/Stats.svelte';
  import Review from './features/review/Review.svelte';
  import Trash from './features/trash/Trash.svelte';
  import Home from './features/home/Home.svelte';
  import Profile from './features/profile/Profile.svelte';
  import CourseOutline from './features/player/CourseOutline.svelte';
  import Exercise from './features/exercise/Exercise.svelte';
  import Unit from './features/unit/Unit.svelte';
  import Challenge from './features/challenge/Challenge.svelte';
  import Play from './features/play/Play.svelte';
  import Drills from './features/drills/Drills.svelte';
  import MockExam from './features/challenge/MockExam.svelte';
  import NavIcon from './ui/NavIcon.svelte';
  import SearchBox from './ui/SearchBox.svelte';
  import ExploreMenu from './ui/ExploreMenu.svelte';
  import LearnerNav from './ui/LearnerNav.svelte';
  import TabBar from './ui/TabBar.svelte';
  import { t } from './i18n/i18n.ts';
  import { watchDiagrams } from './ui/diagrams.ts';
  import { watchGlossary } from './ui/glossaryLayer.ts';

  const route = $derived(app.route);
  const courseRoute = $derived(route.name === 'player' || route.name === 'unit' || route.name === 'exercise' || route.name === 'challenge' || route.name === 'exam');
  let drawerOpen = $state(false);
  let profileMenuOpen = $state(false);

  const profileLabel = $derived(app.settings.profileName.trim() || t('profile.defaultName'));
  const initials = $derived(profileLabel.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toLocaleUpperCase());

  function closeProfileMenu() {
    profileMenuOpen = false;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      drawerOpen = false;
      profileMenuOpen = false;
    }
  }

  onMount(() => {
    // Theme palettes are generated from the themes module and injected once.
    const style = document.createElement('style');
    style.id = 'theme-vars';
    style.textContent = themeCss();
    document.head.appendChild(style);
    void initApp().then(startSync);
    watchDiagrams();
    watchGlossary();
    return () => style.remove();
  });

  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = app.settings.theme;
    root.dataset.colorTheme = app.settings.colorTheme;
    root.style.setProperty('--base-size', app.settings.fontSize + 'px');
    root.lang = app.settings.uiLanguage;
    root.dataset.reduceMotion = String(app.settings.reduceMotion);
    root.dataset.readingFont = app.settings.readingFont;
    root.dataset.lineSpacing = app.settings.lineSpacing;
    root.dataset.layout = app.settings.layout;
  });

  // "Always use the desktop layout": render the page 1100px wide on small screens and let the
  // browser scale it down, the way "request desktop site" works.
  $effect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const desktop = app.settings.screenMode === 'desktop' && Math.min(screen.width, screen.height) < 900;
    meta.setAttribute('content', desktop ? 'width=1100, viewport-fit=cover' : 'width=device-width, initial-scale=1, viewport-fit=cover');
  });

  // Close the drawer and menus whenever the route changes, and start the new screen at the top
  // (a tab bar link would otherwise open halfway down the page).
  $effect(() => {
    void route;
    drawerOpen = false;
    profileMenuOpen = false;
    window.scrollTo({ top: 0 });
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="cf-app" class:focus-mode={app.focusMode} class:cf-has-tabs={!courseRoute && !app.focusMode}>
  {#if !app.focusMode}
    <header class="cf-header" class:cf-header-dark={courseRoute}>
      <div class="cf-header-inner">
        <div class="cf-header-left">
          <button
            type="button"
            class="cf-icon-btn cf-menu-btn"
            aria-label={t('shell.menu')}
            aria-expanded={drawerOpen}
            onclick={() => (drawerOpen = true)}
          >
            <NavIcon name="menu" />
          </button>
          <ExploreMenu />
          <div class="cf-search"><SearchBox /></div>
        </div>

        <a class="cf-brand" href="#/home">
          <span class="cf-brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span>{t('app.name')}</span>
        </a>

        <div class="cf-header-right">
          <details class="cf-user" bind:open={profileMenuOpen}>
            <summary aria-label={t('profile.openMenu')}>
              <span class="cf-user-avatar" style:background={app.settings.profileColor} aria-hidden="true">{initials}</span>
              <span class="cf-user-name">{profileLabel}</span><span class="cf-caret" aria-hidden="true"></span>
            </summary>
            <div class="cf-user-menu">
              <a href="#/profile" onclick={closeProfileMenu}>{t('profile.title')}</a>
              <a href="#/stats" onclick={closeProfileMenu}>{t('home.nav.progress')}</a>
              <a href="#/settings" onclick={closeProfileMenu}>{t('nav.settings')}</a>
              <hr />
              <a href="#/import" onclick={closeProfileMenu}>{t('home.nav.import')}</a>
              <a href="#/prompt" onclick={closeProfileMenu}>{t('home.nav.create')}</a>
              <a href="#/drills" onclick={closeProfileMenu}>{t('drills.nav')}</a>
              <a href="#/play" onclick={closeProfileMenu}>{t('play.nav')}</a>
              <a href="#/trash" onclick={closeProfileMenu}>{t('nav.trash')}</a>
            </div>
          </details>
        </div>
      </div>
    </header>
  {/if}

  {#if drawerOpen && !app.focusMode}
    <div class="cf-overlay" role="presentation" onclick={() => (drawerOpen = false)}></div>
    <aside class="cf-drawer" aria-label={t('nav.label')}>
      <div class="cf-drawer-head">
        <span>{t('app.name')}</span>
        <button type="button" class="cf-icon-btn" aria-label={t('shell.close')} onclick={() => (drawerOpen = false)}>
          <NavIcon name="close" />
        </button>
      </div>
      {#if route.name === 'player'}
        <div class="cf-drawer-outline"><CourseOutline courseId={route.courseId} lessonId={route.lessonId} /></div>
      {/if}
      <LearnerNav />
    </aside>
  {/if}

  {#if !app.ready}
    <div class="loading" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <span>{t('app.loading')}</span>
    </div>
  {:else if route.name === 'home'}
    <Home />
  {:else if route.name === 'unit'}
    <Unit courseId={route.courseId} moduleId={route.moduleId} />
  {:else if route.name === 'player'}
    <div class="cf-course-layout">
      {#if !app.focusMode}
        <aside class="cf-course-side"><CourseOutline courseId={route.courseId} lessonId={route.lessonId} /></aside>
      {/if}
      <main class="cf-course-main"><Player courseId={route.courseId} lessonId={route.lessonId} /></main>
    </div>
  {:else if route.name === 'exercise'}
    <main class="cf-page cf-page-narrow"><Exercise courseId={route.courseId} skillId={route.skillId} /></main>
  {:else if route.name === 'challenge'}
    <main class="cf-page cf-page-narrow"><Challenge courseId={route.courseId} /></main>
  {:else if route.name === 'exam'}
    <main class="cf-page cf-page-narrow"><MockExam courseId={route.courseId} /></main>
  {:else}
    <div class="cf-page cf-with-nav">
      <LearnerNav />
      <main class="cf-main">
        {#if route.name === 'library'}
          <Library />
        {:else if route.name === 'import'}
          <ImportPanel />
        {:else if route.name === 'prompt'}
          <PromptBuilder />
        {:else if route.name === 'stats'}
          <Stats />
        {:else if route.name === 'review'}
          <Review />
        {:else if route.name === 'profile'}
          <Profile />
        {:else if route.name === 'trash'}
          <Trash />
        {:else if route.name === 'drills'}
          {#key route.id}<Drills id={route.id} />{/key}
        {:else if route.name === 'play'}
          <Play view={route.view} id={route.id} />
        {:else}
          <Settings courseId={route.courseId} />
        {/if}
      </main>
    </div>
  {/if}
</div>

{#if !courseRoute && !app.focusMode && app.ready}
  <TabBar />
{/if}

{#if app.toast}
  <div class="toast" role="status">
    <span>{app.toast.message}</span>
    {#if app.toast.actionLabel}
      <button type="button" class="toast-action" onclick={runToastAction}>{app.toast.actionLabel}</button>
    {/if}
    <button type="button" class="toast-close" aria-label={t('common.dismiss')} onclick={dismissToast}>×</button>
  </div>
{/if}
