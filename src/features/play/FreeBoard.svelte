<script lang="ts">
  // The free board: a game against the app's own small engine, from the start or any position.
  import ChessPlay from '../../ui/chess/ChessPlay.svelte';
  import { gameAt, START_FEN, type Color } from '../../core/chess.ts';
  import { app } from '../../core/state.svelte.ts';
  import { t } from '../../i18n/i18n.ts';

  let color = $state<Color>('w');
  let fen = $state(START_FEN);
  let game = $state(0);
  let pasted = $state('');
  let pasteError = $state('');

  function newGame(as: Color) {
    color = as;
    fen = START_FEN;
    game += 1;
  }

  function loadPosition() {
    const text = pasted.trim();
    const position = gameAt(text);
    if (!position || position.isGameOver()) {
      pasteError = t('play.badFen');
      return;
    }
    pasteError = '';
    fen = position.fen();
    color = position.turn();
    game += 1;
  }
</script>

<p class="muted page-intro">{t('play.intro')}</p>

<div class="row">
  <button type="button" class="btn" class:primary={color === 'w' && fen === START_FEN} onclick={() => newGame('w')}>{t('play.asWhite')}</button>
  <button type="button" class="btn" class:primary={color === 'b' && fen === START_FEN} onclick={() => newGame('b')}>{t('play.asBlack')}</button>
</div>

{#key game}
  <ChessPlay {fen} learner={color} level={3} celebrations={app.settings.celebrations} sounds={app.settings.sounds} />
{/key}

<details class="cf-play-setup">
  <summary>{t('play.fromPosition')}</summary>
  <label for="play-fen">{t('play.fenLabel')}</label>
  <input id="play-fen" type="text" bind:value={pasted} placeholder="r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3" autocomplete="off" spellcheck="false" />
  {#if pasteError}<p class="field-error">{pasteError}</p>{/if}
  <div class="row"><button type="button" class="btn" onclick={loadPosition} disabled={pasted.trim() === ''}>{t('play.load')}</button></div>
  <p class="muted small">{t('play.fenHint')}</p>
</details>
