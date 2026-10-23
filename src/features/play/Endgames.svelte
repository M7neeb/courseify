<script lang="ts">
  // The endgame drills, from basic mates to the Lucena and Philidor positions.
  import MiniBoard from '../../ui/chess/MiniBoard.svelte';
  import { ENDGAMES, type EndgameDrill } from '../../core/endgames.ts';
  import { chess } from './chessStore.svelte.ts';
  import { t } from '../../i18n/i18n.ts';

  const levels: EndgameDrill['level'][] = ['basic', 'intermediate', 'advanced'];
  const doneCount = $derived(ENDGAMES.filter((d) => chess.record.endgames[d.id]?.done).length);
</script>

<p class="muted page-intro">{t('endgames.intro')}</p>
<p class="cf-game-stats">{t('endgames.done', { n: doneCount, total: ENDGAMES.length })}</p>

{#each levels as level (level)}
  <section class="cf-drill-group" aria-labelledby={'cf-eg-' + level}>
    <h2 id={'cf-eg-' + level}>{t('endgames.level.' + level)}</h2>
    <ul class="cf-drill-list">
      {#each ENDGAMES.filter((d) => d.level === level) as d (d.id)}
        {@const rec = chess.record.endgames[d.id]}
        <li>
          <a href={'#/play/endgame/' + d.id} class="cf-drill">
            <span class="cf-drill-board" aria-hidden="true"><MiniBoard fen={d.fen} orientation={d.learner} /></span>
            <span class="cf-drill-text">
              <span class="cf-drill-name">{t('endgames.name.' + d.id)}</span>
              <span class="muted small">{t('endgames.goal.' + d.goal, { n: d.maxMoves })}</span>
              {#if rec?.done}<span class="cf-drill-done">{t('endgames.solved', { n: rec.bestMoves ?? 0 })}</span>{/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/each}
