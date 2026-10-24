<script lang="ts">
  // Choose a bot (or make one at any strength), a colour, a clock and whether hints are allowed,
  // then start a game.
  import { onDestroy } from 'svelte';
  import { BOTS, CUSTOM_MAX, CUSTOM_MIN, botById, botGroup, customBot, type Bot, type BotGroup } from '../../core/bots.ts';
  import { START_FEN } from '../../core/chess.ts';
  import { TIME_CONTROLS, sameTime, timeCategory, timeLabel, type TimeControl, START_RATING } from '../../core/clock.ts';
  import { openingOf } from '../../core/openings.ts';
  import { app, navigate } from '../../core/state.svelte.ts';
  import BotAvatar from '../../ui/chess/BotAvatar.svelte';
  import { newGame, watchEngineStatus, type EngineStatus } from '../../ui/chess/stockfish.ts';
  import { chess, deleteGame, newGameId, saveGame, unfinishedGame } from './chessStore.svelte.ts';
  import { t } from '../../i18n/i18n.ts';

  const PREF_KEY = 'courseify:chessBot';
  type ColorChoice = 'w' | 'random' | 'b';

  function readPref(): { bot: string; color: ColorChoice; assist: boolean; time: TimeControl | null; custom: number } {
    const fallback = { bot: 'mara', color: 'w' as ColorChoice, assist: true, time: null, custom: 1200 };
    try {
      const raw = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}');
      const time = TIME_CONTROLS.find((tc) => sameTime(tc, raw.time)) ?? null;
      return {
        bot: typeof raw.bot === 'string' && botById(raw.bot) ? raw.bot : fallback.bot,
        color: raw.color === 'b' || raw.color === 'random' ? raw.color : 'w',
        assist: raw.assist !== false,
        time,
        custom: typeof raw.custom === 'number' ? raw.custom : fallback.custom
      };
    } catch {
      return fallback;
    }
  }

  const pref = readPref();
  let selectedId = $state(pref.bot.startsWith('custom-') ? 'custom' : pref.bot);
  let customElo = $state(pref.custom);
  let colorChoice = $state<ColorChoice>(pref.color);
  let assist = $state(pref.assist);
  let time = $state<TimeControl | null>(pref.time);
  let engine = $state<EngineStatus>('idle');
  const stop = watchEngineStatus((s) => (engine = s));
  onDestroy(stop);

  const selected = $derived<Bot>(selectedId === 'custom' ? customBot(customElo) : (botById(selectedId) ?? BOTS[0]!));
  const waiting = $derived(unfinishedGame());
  const waitingBot = $derived(waiting ? botById(waiting.botId) : undefined);
  const groups: BotGroup[] = ['beginner', 'intermediate', 'advanced', 'master'];
  const lang = $derived(app.settings.uiLanguage === 'de' ? 'de' : 'en');
  const rating = $derived(chess.record.rating);

  /** Names of the openings a bot likes, from its book. */
  const favourites = $derived.by(() => {
    const names: string[] = [];
    for (const line of selected.book ?? []) {
      const name = openingOf(line.split(' ')).opening?.[lang];
      if (name && !names.includes(name)) names.push(name);
    }
    return names.slice(0, 3);
  });

  function choose(id: string) {
    selectedId = id;
    // On a phone the details sit under the list: bring them into view.
    requestAnimationFrame(() => document.getElementById('cf-bot-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  async function start() {
    const color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice;
    const bot = selected;
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ bot: bot.id, color: colorChoice, assist, time, custom: customElo }));
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
    await saveGame({
      id,
      botId: bot.id,
      color,
      startFen: START_FEN,
      moves: [],
      startedAt: new Date().toISOString(),
      assist,
      rated: !assist,
      ...(time ? { time, clock: { w: time.base * 1000, b: time.base * 1000 } } : {})
    });
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
            <button type="button" class="cf-bot-card" aria-pressed={selectedId === bot.id} onclick={() => choose(bot.id)}>
              <BotAvatar {bot} size={40} />
              <span class="cf-bot-name">{bot.name}</span>
              <span class="cf-bot-elo">{bot.elo}</span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
    <section class="cf-bot-group" aria-labelledby="cf-bots-custom">
      <h2 id="cf-bots-custom">{t('bots.group.custom')}</h2>
      <div class="cf-bot-grid">
        <button type="button" class="cf-bot-card" aria-pressed={selectedId === 'custom'} onclick={() => choose('custom')}>
          <BotAvatar bot={customBot(customElo)} size={40} />
          <span class="cf-bot-name">{t('bots.customName')}</span>
          <span class="cf-bot-elo">{CUSTOM_MIN}-{CUSTOM_MAX}</span>
        </button>
      </div>
    </section>
  </div>

  <aside class="cf-bot-detail" id="cf-bot-detail" aria-live="polite">
    <div class="cf-bot-hero">
      <BotAvatar bot={selected} size={72} />
      <div>
        <h2>{selected.custom ? t('bots.customName') : selected.name}</h2>
        <p class="cf-bot-rating">{t('bots.rating', { elo: selected.elo })}</p>
      </div>
    </div>

    {#if selected.custom}
      <label class="cf-custom-elo">
        <span>{t('bots.customStrength', { elo: selected.elo })}</span>
        <input type="range" min={CUSTOM_MIN} max={CUSTOM_MAX} step="50" bind:value={customElo} />
      </label>
      <p class="cf-bot-style">{t('bots.style.custom')}</p>
    {:else}
      <p class="cf-bot-style">{t('bots.style.' + selected.id)}</p>
      <p class="cf-bot-tags">
        <span class="cf-tag">{t('bots.styleName.' + selected.style)}</span>
        {#each favourites as name (name)}<span class="cf-tag soft">{name}</span>{/each}
      </p>
    {/if}

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

    <fieldset class="cf-time-pick">
      <legend>{t('bots.time')}</legend>
      <div class="cf-time-grid">
        {#each TIME_CONTROLS as tc (tc ? tc.base + '+' + tc.inc : 'none')}
          <button type="button" class="cf-time" aria-pressed={sameTime(tc, time)} onclick={() => (time = tc)}>
            <span class="cf-time-main">{tc ? timeLabel(tc) : t('bots.noTimer')}</span>
            {#if tc}<span class="cf-time-kind">{t('bots.timeKind.' + timeCategory(tc))}</span>{/if}
          </button>
        {/each}
      </div>
    </fieldset>

    <label class="cf-check">
      <input type="checkbox" bind:checked={assist} />
      <span>{t('bots.assist')}</span>
    </label>
    <p class="muted small">{assist ? t('bots.assistOn') : t('bots.assistOff')}</p>

    <button type="button" class="btn primary cf-bot-play" onclick={start}>{t('bots.play', { name: selected.custom ? t('bots.customName') : selected.name })}</button>

    <div class="cf-my-rating">
      {#if rating}
        <p><strong>{t('bots.yourRating', { rating: rating.value })}</strong></p>
        <p class="muted small">{t('bots.ratingGames', { n: rating.games, peak: rating.peak })}</p>
      {:else}
        <p class="muted small">{t('bots.ratingStart', { rating: START_RATING })}</p>
      {/if}
    </div>

    {#if engine === 'loading'}
      <p class="muted small" role="status">{t('bots.engineLoading')}</p>
    {:else if engine === 'failed'}
      <p class="muted small" role="status">{t('bots.engineFailed')}</p>
    {/if}
  </aside>
</div>
