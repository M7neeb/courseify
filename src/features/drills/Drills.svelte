<script lang="ts">
  // The Drills section: endless generated practice for IT and maths, plus a graph plotter.
  import { onMount } from 'svelte';
  import { DRILLS, drillById, type DrillGroup, type Level } from '../../core/drills.ts';
  import { drillStats, loadDrillStats, recordDrill, setDrillLevel, statFor } from '../../core/drillsStore.svelte.ts';
  import { app } from '../../core/state.svelte.ts';
  import DrillRunner from '../../ui/drills/DrillRunner.svelte';
  import SubnetDrill from '../../ui/drills/SubnetDrill.svelte';
  import GraphPlotter from './GraphPlotter.svelte';
  import { t } from '../../i18n/i18n.ts';

  let { id }: { id?: string } = $props();

  onMount(() => void loadDrillStats());

  const groups: { group: DrillGroup; key: string }[] = [
    { group: 'it', key: 'drills.group.it' },
    { group: 'maths', key: 'drills.group.maths' }
  ];
  const levels: Level[] = [1, 2, 3];

  const def = $derived(id ? drillById(id) : undefined);
  /** The subnet drill has several boxes per task, so it is not in the one-answer list. */
  const drillId = $derived(id === 'subnet' ? 'subnet' : def?.id);
  const stat = $derived(drillId ? statFor(drillId) : null);
  let streak = $state(0);
  const level = $derived<Level>(stat?.level ?? 1);

  function onResult(r: { firstTry: boolean; solved: boolean }) {
    if (!drillId) return;
    streak = r.firstTry ? streak + 1 : 0;
    void recordDrill(drillId, r.solved, streak);
  }

  function chooseLevel(l: Level) {
    if (!drillId || l === level) return;
    streak = 0;
    void setDrillLevel(drillId, l);
  }
</script>

<section class="stack drills-page">
  {#if id === 'graph'}
    <a class="link small" href="#/drills">{t('drills.back')}</a>
    <div class="page-head"><div class="page-title-group"><h1>{t('graph.plotter')}</h1></div></div>
    <p class="muted">{t('graph.plotterIntro')}</p>
    <GraphPlotter />
  {:else if drillId}
    <a class="link small" href="#/drills">{t('drills.back')}</a>
    <div class="page-head">
      <div class="page-title-group">
        <h1>{t(`drill.${drillId}.name`)}</h1>
      </div>
    </div>
    <p class="muted">{t(`drill.${drillId}.desc`)}</p>
    <div class="drills-bar">
      <div class="cf-segmented" role="group" aria-label={t('drills.level')}>
        {#each levels as l (l)}
          <button type="button" aria-pressed={level === l} onclick={() => chooseLevel(l)}>{t(`drills.level${l}`)}</button>
        {/each}
      </div>
      {#if drillStats.loaded}
        <p class="drills-stats muted small">
          <span>{t('drills.streak', { n: streak })}</span>
          <span>{t('drills.best', { n: stat?.best ?? 0 })}</span>
          <span>{t('drills.solved', { n: stat?.solved ?? 0 })}</span>
        </p>
      {/if}
    </div>
    {#if drillStats.loaded && drillId === 'subnet'}
      <SubnetDrill {level} lang={app.settings.uiLanguage} sounds={app.settings.sounds} {onResult} />
    {:else if drillStats.loaded && def}
      <DrillRunner drill={def.id} {level} lang={app.settings.uiLanguage} sounds={app.settings.sounds} {onResult} />
    {/if}
  {:else}
    <div class="page-head">
      <div class="page-title-group">
        <h1>{t('drills.title')}</h1>
      </div>
    </div>
    <p class="muted">{t('drills.intro')}</p>
    {#each groups as g (g.group)}
      <h2 class="drills-group">{t(g.key)}</h2>
      <ul class="drills-list">
        {#if g.group === 'it'}
          <li>
            <a class="drills-item" href="#/drills/subnet">
              <span class="drills-name">{t('drill.subnet.name')}</span>
              <span class="drills-desc muted small">{t('drill.subnet.desc')}</span>
              {#if statFor('subnet').solved > 0}<span class="drills-count small">{t('drills.solved', { n: statFor('subnet').solved })}</span>{/if}
            </a>
          </li>
        {/if}
        {#each DRILLS.filter((d) => d.group === g.group) as d (d.id)}
          {@const s = statFor(d.id)}
          <li>
            <a class="drills-item" href={`#/drills/${d.id}`}>
              <span class="drills-name">{t(`drill.${d.id}.name`)}</span>
              <span class="drills-desc muted small">{t(`drill.${d.id}.desc`)}</span>
              {#if s.solved > 0}<span class="drills-count small">{t('drills.solved', { n: s.solved })}</span>{/if}
            </a>
          </li>
        {/each}
        {#if g.group === 'maths'}
          <li>
            <a class="drills-item" href="#/drills/graph">
              <span class="drills-name">{t('graph.plotter')}</span>
              <span class="drills-desc muted small">{t('graph.plotterDesc')}</span>
            </a>
          </li>
        {/if}
      </ul>
    {/each}
  {/if}
</section>
