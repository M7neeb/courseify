<script lang="ts">
  // The learner sidebar: "My stuff" and "My account" groups with a
  // blue bar on the current page. Shared by every learner screen so the navigation never moves.
  import { app } from '../core/state.svelte.ts';
  import { listMistakes } from '../core/mistakes.ts';
  import { t } from '../i18n/i18n.ts';

  const reviewCount = $derived(listMistakes(app.courses, app.progress, app.settings.questionLanguage).length);

  const groups = [
    {
      key: 'home.nav.myStuff',
      links: [
        { route: 'home', href: '#/home', key: 'home.nav.courses' },
        { route: 'review', href: '#/review', key: 'home.nav.review' },
        { route: 'library', href: '#/library', key: 'home.nav.library' },
        { route: 'drills', href: '#/drills', key: 'drills.nav' },
        { route: 'play', href: '#/play', key: 'play.nav' }
      ]
    },
    {
      key: 'home.nav.myAccount',
      links: [
        { route: 'stats', href: '#/stats', key: 'home.nav.progress' },
        { route: 'profile', href: '#/profile', key: 'home.nav.profile' },
        { route: 'settings', href: '#/settings', key: 'home.nav.settings' }
      ]
    }
  ] as const;
</script>

<nav class="cf-learner-nav" aria-label={t('home.nav.label')}>
  {#each groups as group (group.key)}
    <p class="cf-learner-group">{t(group.key)}</p>
    <ul>
      {#each group.links as link (link.route)}
        {@const current = app.route.name === link.route}
        <li>
          <a href={link.href} class:active={current} aria-current={current ? 'page' : undefined}>
            {t(link.key)}
            {#if link.route === 'review' && reviewCount > 0}<span class="cf-count">{reviewCount}</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
  {/each}
</nav>
