<script lang="ts">
  // A bot's face: a coloured circle with its chess piece.
  import type { Bot } from '../../core/bots.ts';

  let { bot, size = 44 }: { bot: Bot; size?: number } = $props();
  const GLYPH: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
</script>

<span class="cf-bot-avatar" style:background={bot.color} style:width={size + 'px'} style:height={size + 'px'} style:font-size={size * 0.62 + 'px'} aria-hidden="true">
  {GLYPH[bot.piece]}&#xFE0E;
</span>
