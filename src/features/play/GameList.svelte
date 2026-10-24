<script lang="ts">
  // Your games against the bots, newest first, with the result and, once reviewed, your accuracy.
  import BotAvatar from '../../ui/chess/BotAvatar.svelte';
  import { botById } from '../../core/bots.ts';
  import { reviewGame } from '../../core/review.ts';
  import { START_FEN } from '../../core/chess.ts';
  import { timeLabel } from '../../core/clock.ts';
  import { app } from '../../core/state.svelte.ts';
  import type { SavedGame } from '../../core/types.ts';
  import { chess, deleteGame, isReviewed } from './chessStore.svelte.ts';
  import { t } from '../../i18n/i18n.ts';

  let confirming = $state<string | null>(null);

  const games = $derived([...chess.games].sort((a, b) => (b.startedAt < a.startedAt ? -1 : 1)));
  const stats = $derived.by(() => {
    const done = chess.games.filter((g) => g.result);
    return { won: done.filter((g) => g.result === 'won').length, draw: done.filter((g) => g.result === 'draw').length, lost: done.filter((g) => g.result === 'lost').length };
  });

  // A full review is heavy; remember each game's result until its analysis changes.
  const accuracyCache = new Map<string, { key: number; value: number }>();
  function accuracy(g: SavedGame): number | null {
    if (!isReviewed(g)) return null;
    const key = g.evals?.length ?? 0;
    const hit = accuracyCache.get(g.id);
    if (hit && hit.key === key) return hit.value;
    const value = reviewGame(g.startFen, g.moves, g.evals ?? [], g.startFen === START_FEN).accuracy[g.color];
    accuracyCache.set(g.id, { key, value });
    return value;
  }

  function when(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(app.settings.uiLanguage === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return iso.slice(0, 10);
    }
  }

  async function remove(id: string) {
    if (confirming !== id) {
      confirming = id;
      return;
    }
    confirming = null;
    await deleteGame(id);
  }
</script>

{#if games.length === 0}
  <div class="cf-empty">
    <p>{t('games.empty')}</p>
    <a class="btn primary" href="#/play">{t('bots.choose')}</a>
  </div>
{:else}
  <p class="cf-game-stats">{t('games.stats', stats)}</p>
  <ul class="cf-game-list">
    {#each games as g (g.id)}
      {@const bot = botById(g.botId)}
      {@const acc = accuracy(g)}
      {#if bot}
        <li>
          <BotAvatar {bot} size={40} />
          <div class="cf-game-info">
            <p class="cf-game-title">
              {t('games.vs', { name: bot.name, elo: bot.elo })}
              <span class="cf-result" data-result={g.result ?? 'playing'}>{t('games.result.' + (g.result ?? 'playing'))}</span>
            </p>
            <p class="muted small">
              {when(g.startedAt)} · {t('games.moves', { n: Math.ceil(g.moves.length / 2) })} · {t(g.color === 'w' ? 'chess.white' : 'chess.black')}
              · {g.time ? timeLabel(g.time) : t('bots.noTimer')}
              {#if acc !== null} · {t('games.accuracy', { n: acc.toFixed(1) })}{/if}
              {#if g.ratingChange !== undefined} · <span class="cf-rating-change" class:up={g.ratingChange > 0} class:down={g.ratingChange < 0}>{g.ratingChange > 0 ? '+' : ''}{g.ratingChange}</span>{/if}
            </p>
          </div>
          <div class="cf-game-actions">
            {#if g.result}
              <a class="btn primary" href={'#/play/review/' + encodeURIComponent(g.id)}>{isReviewed(g) ? t('games.review') : t('games.analyse')}</a>
            {:else}
              <a class="btn primary" href={'#/play/game/' + encodeURIComponent(g.id)}>{t('bots.continue')}</a>
            {/if}
            <button type="button" class="btn danger" onclick={() => remove(g.id)}>{confirming === g.id ? t('games.deleteConfirm') : t('games.delete')}</button>
          </div>
        </li>
      {/if}
    {/each}
  </ul>
{/if}
