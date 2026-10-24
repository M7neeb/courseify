<script lang="ts">
  // The board settings: colours and what the board does, kept on this device.
  import { BOARD_THEMES, chessPrefs, setChessPref, type ChessPrefs } from './prefs.svelte.ts';
  import { t } from '../../i18n/i18n.ts';

  const TOGGLES: (keyof Omit<ChessPrefs, 'theme'>)[] = ['legal', 'coords', 'sounds', 'animate', 'premoves', 'autoQueen'];
  const SWATCH: Record<string, [string, string]> = {
    green: ['#ebecd0', '#779556'],
    brown: ['#f0d9b5', '#b58863'],
    blue: ['#dee3e6', '#8ca2ad'],
    purple: ['#efeaf6', '#8877b7'],
    gray: ['#e3e3e3', '#a3a3a3']
  };
</script>

<details class="cf-board-settings">
  <summary aria-label={t('chess.settings.title')}>
    <svg class="cf-gear" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.4h-4l-.3 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>
    <span class="cf-gear-label">{t('chess.settings.title')}</span>
  </summary>
  <div class="cf-board-settings-panel">
    <fieldset class="cf-theme-pick">
      <legend>{t('chess.settings.theme')}</legend>
      {#each BOARD_THEMES as theme (theme)}
        <button type="button" class="cf-theme" aria-pressed={chessPrefs.theme === theme} aria-label={t('chess.settings.themeName.' + theme)} title={t('chess.settings.themeName.' + theme)} onclick={() => setChessPref('theme', theme)}>
          <span style:background={SWATCH[theme]![0]}></span><span style:background={SWATCH[theme]![1]}></span><span style:background={SWATCH[theme]![1]}></span><span style:background={SWATCH[theme]![0]}></span>
        </button>
      {/each}
    </fieldset>
    {#each TOGGLES as key (key)}
      <label class="cf-check">
        <input type="checkbox" checked={chessPrefs[key]} onchange={(e) => setChessPref(key, e.currentTarget.checked)} />
        <span>{t('chess.settings.' + key)}</span>
      </label>
    {/each}
    <p class="muted small">{t('chess.drawTip')}</p>
  </div>
</details>
