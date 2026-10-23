<script lang="ts">
  // Milestones: real steps reached (lessons, mastered skills, streaks, chess wins), each with the
  // date it was first earned, and how far the next ones are.
  import { app } from '../core/state.svelte.ts';
  import type { MilestoneState } from '../core/goals.ts';
  import { t } from '../i18n/i18n.ts';

  let { states }: { states: MilestoneState[] } = $props();

  const locale = $derived(app.settings.uiLanguage === 'de' ? 'de-DE' : 'en-GB');
  const earned = $derived(states.filter((s) => s.earned).length);
  const ICON: Record<string, string> = { learn: '★', habit: '◆', chess: '♞' };
  function when(iso: string | undefined): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  }
</script>

<section class="cf-prog-section" aria-labelledby="cf-ms-title">
  <h2 id="cf-ms-title">{t('milestone.title')}</h2>
  <p class="cf-muted cf-small">{t('milestone.count', { n: earned, total: states.length })}</p>
  <ul class="cf-milestones">
    {#each states as s (s.milestone.id)}
      <li class:earned={s.earned} data-group={s.milestone.group}>
        <span class="cf-ms-icon" aria-hidden="true">{ICON[s.milestone.group]}&#xFE0E;</span>
        <span class="cf-ms-text">
          <span class="cf-ms-name">{t('milestone.' + s.milestone.id + '.name')}</span>
          <span class="cf-ms-how">{t('milestone.' + s.milestone.id + '.how')}</span>
          {#if s.earned}
            <span class="cf-ms-when">{t('milestone.earnedOn', { date: when(s.at) })}</span>
          {:else}
            <span class="cf-ms-bar" role="progressbar" aria-valuemin="0" aria-valuemax={s.milestone.target} aria-valuenow={Math.min(s.value, s.milestone.target)} aria-label={t('milestone.' + s.milestone.id + '.name')}>
              <span style:width={Math.min(100, (s.value / s.milestone.target) * 100) + '%'}></span>
            </span>
          {/if}
        </span>
      </li>
    {/each}
  </ul>
</section>
