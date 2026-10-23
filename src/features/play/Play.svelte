<script lang="ts">
  // The Chess section: play the bots, review games, endgame drills and a free board.
  import { onMount } from 'svelte';
  import BotPicker from './BotPicker.svelte';
  import BotGame from './BotGame.svelte';
  import GameList from './GameList.svelte';
  import GameReview from './GameReview.svelte';
  import Endgames from './Endgames.svelte';
  import EndgameDrill from './EndgameDrill.svelte';
  import FreeBoard from './FreeBoard.svelte';
  import { chess, loadChess } from './chessStore.svelte.ts';
  import { loadEngine } from '../../ui/chess/stockfish.ts';
  import type { ChessView } from '../../core/types.ts';
  import { t } from '../../i18n/i18n.ts';

  let { view = 'bots', id }: { view?: ChessView; id?: string } = $props();

  onMount(() => {
    void loadChess();
    // Start fetching the engine right away, so the first bot move does not wait for it.
    void loadEngine();
  });

  const tabs: { view: ChessView; href: string; key: string }[] = [
    { view: 'bots', href: '#/play', key: 'play.tab.bots' },
    { view: 'games', href: '#/play/games', key: 'play.tab.games' },
    { view: 'endgames', href: '#/play/endgames', key: 'play.tab.endgames' },
    { view: 'board', href: '#/play/board', key: 'play.tab.board' }
  ];
  const tabOf = (v: ChessView): ChessView => (v === 'game' ? 'bots' : v === 'review' ? 'games' : v === 'endgame' ? 'endgames' : v);
</script>

<section class="stack cf-chess-section">
  <div class="page-head">
    <div class="page-title-group">
      <h1>{t('play.title')}</h1>
    </div>
  </div>

  <nav class="cf-chess-tabs" aria-label={t('play.tabsLabel')}>
    {#each tabs as tab (tab.view)}
      <a href={tab.href} class:active={tabOf(view) === tab.view} aria-current={tabOf(view) === tab.view ? 'page' : undefined}>{t(tab.key)}</a>
    {/each}
  </nav>

  {#if !chess.loaded}
    <div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><span>{t('app.loading')}</span></div>
  {:else if view === 'game' && id}
    {#key id}<BotGame {id} />{/key}
  {:else if view === 'review' && id}
    {#key id}<GameReview {id} />{/key}
  {:else if view === 'games'}
    <GameList />
  {:else if view === 'endgames'}
    <Endgames />
  {:else if view === 'endgame' && id}
    {#key id}<EndgameDrill {id} />{/key}
  {:else if view === 'board'}
    <FreeBoard />
  {:else}
    <BotPicker />
  {/if}
</section>
