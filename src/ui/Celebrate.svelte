<script lang="ts">
  // A short confetti burst for meaningful moments only (a new mastery level, the daily goal).
  // Pure CSS, pointer-events off, gone after two seconds, and skipped entirely with reduced motion.
  let { message }: { message: string } = $props();

  const COLORS = ['#2346b5', '#7d98e0', '#ffe36e', '#1f7a4d', '#b8322f'];
  const pieces = Array.from({ length: 28 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 7) * 0.06,
    color: COLORS[i % COLORS.length],
    rotate: (i * 47) % 360,
    drift: ((i % 5) - 2) * 18
  }));
</script>

<div class="celebrate-banner" role="status">
  <span class="celebrate-confetti" aria-hidden="true">
    {#each pieces as piece, i (i)}
      <span
        class="confetti-piece"
        style:left={piece.left + '%'}
        style:background={piece.color}
        style:animation-delay={piece.delay + 's'}
        style:--rotate={piece.rotate + 'deg'}
        style:--drift={piece.drift + 'px'}
      ></span>
    {/each}
  </span>
  <strong>{message}</strong>
</div>

<style>
  .celebrate-banner {
    position: relative;
    overflow: hidden;
    margin: 0 0 1rem;
    padding: 0.9rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    color: var(--ink);
  }
  .celebrate-confetti {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .confetti-piece {
    position: absolute;
    top: -12px;
    width: 7px;
    height: 12px;
    border-radius: 2px;
    opacity: 0;
    animation: confetti-fall 1.6s ease-in forwards;
  }
  @keyframes confetti-fall {
    0% { opacity: 1; transform: translate(0, 0) rotate(0deg); }
    100% { opacity: 0; transform: translate(var(--drift), 90px) rotate(var(--rotate)); }
  }
  :global([data-reduce-motion='true']) .confetti-piece {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .confetti-piece { display: none; }
  }
</style>
