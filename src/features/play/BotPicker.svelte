<script lang="ts">
  // Choose a bot, a colour and whether hints are allowed, then start a game.
  import { onDestroy } from 'svelte';
  import { BOTS, botById, botGroup, type Bot, type BotGroup } from '../../core/bots.ts';
  import { START_FEN } from '../../core/chess.ts';
  import { navigate } from '../../core/state.svelte.ts';
  import BotAvatar from '../../ui/chess/BotAvatar.svelte';
  import { newGame, watchEngineStatus, type EngineStatus } from '../../ui/chess/stockfish.ts';
  import { deleteGame, newGameId, saveGame, unfinishedGame } from './chessStore.svelte.ts';
  import { t } from '../../i18n/i18n.ts';

  const PREF_KEY = 'courseify:chessBot';
  type ColorChoice = 'w' | 'random' | 'b';

  function readPref(): { bot: string; color: ColorChoice; assist: boolean } {
    try {
      const raw = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}');
      return {
        bot: typeof raw.bot === 'string' && botById(raw.bot) ? raw.bot : 'mara',
        color: raw.color === 'b' || raw.color === 'random' ? raw.color : 'w',
        assist: raw.assist !== false
      };
    } catch {
      return { bot: 'mara', color: 'w', assist: true };
    }
  }

  const pref = readPref();
  let selectedId = $state(pref.bot);
  let colorChoice = $state<ColorChoice>(pref.color);
  let assist = $state(pref.assist);
  let engine = $state<EngineStatus>('idle');
  const stop = watchEngineStatus((s) => (engine = s));
  onDestroy(stop);

  const selected = $derived(botById(selectedId) as Bot);
  const waiting = $derived(unfinishedGame());
  const waitingBot = $derived(waiting ? botById(waiting.botId) : undefined);
  const groups: BotGroup[] = ['beginner', 'intermediate', 'advanced', 'master'];

  function choose(bot: Bot) {
    selectedId = bot.id;
    // On a phone the details sit under the list: bring them into view.
    requestAnimationFrame(() => document.getElementById('cf-bot-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  async function start() {
    const color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice;
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ bot: selectedId, color: colorChoice, assist }));
    } catch {
      /* only a convenience */
    }
    // An unfinished game is left behind: count it as given up, or drop it when it barely began.
    if (waiting) {
      if (waiting.moves.length < 2) await deleteGame(waiting.id);
      else await saveGame({ ...waiting, result: 'lost', reason: 'resign', finishedAt: new Date().toISOString() });
    }
    const id = newGameId();
    newGame();
    await saveGame({ id, botId: selectedId, color, startFen: START_FEN, moves: [], startedAt: new Date().toISOString(), assist });
    navigate({ name: 'play', view: 'game', id });
  }
</script>

{#if waiting && waitingBot}
  <div class="cf-continue">
    <BotAvatar bot={waitingBot} size={40} />
    <p>{t('bots.unfinished', { name: waitingBot.name, n: Math.ceil(waiting.moves.length / 2) })}</p>
    <a class="btn primary" href={'#/play/game/' + encodeURIComponent(waiting.id)}>{t('bots.continue')}</a>
  </div>
{/if}

<div class="cf-bots-layout">
  <div class="cf-bot-groups">
    {#each groups as group (group)}
      <section class="cf-bot-group" aria-labelledby={'cf-bots-' + group}>
        <h2 id={'cf-bots-' + group}>{t('bots.group.' + group)}</h2>
        <div class="cf-bot-grid">
          {#each BOTS.filter((b) => botGroup(b) === group) as bot (bot.id)}
            <button type="button" class="cf-bot-card" aria-pressed={selectedId === bot.id} onclick={() => choose(bot)}>
              <BotAvatar {bot} size={40} />
              <span class="cf-bot-name">{bot.name}</span>
              <span class="cf-bot-elo">{bot.elo}</span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  </div>

  <aside class="cf-bot-detail" id="cf-bot-detail" aria-live="polite">
    <div class="cf-bot-hero">
      <BotAvatar bot={selected} size={72} />
      <div>
        <h2>{selected.name}</h2>
        <p class="cf-bot-rating">{t('bots.rating', { elo: selected.elo })}</p>
      </div>
    </div>
    <p class="cf-bot-style">{t('bots.style.' + selected.id)}</p>

    <fieldset class="cf-color-pick">
      <legend>{t('bots.playAs')}</legend>
      {#each ['w', 'random', 'b'] as c (c)}
        <label class:on={colorChoice === c}>
          <input type="radio" name="cf-color" value={c} bind:group={colorChoice} />
          <span class="cf-color-dot" data-c={c} aria-hidden="true"></span>
          {t('bots.color.' + c)}
        </label>
      {/each}
    </fieldset>

    <label class="cf-check">
      <input type="checkbox" bind:checked={assist} />
      <span>{t('bots.assist')}</span>
    </label>
    <p class="muted small">{assist ? t('bots.assistOn') : t('bots.assistOff')}</p>

    <button type="button" class="btn primary cf-bot-play" onclick={start}>{t('bots.play', { name: selected.name })}</button>

    {#if engine === 'loading'}
      <p class="muted small" role="status">{t('bots.engineLoading')}</p>
    {:else if engine === 'failed'}
      <p class="muted small" role="status">{t('bots.engineFailed')}</p>
    {/if}
  </aside>
</div>
