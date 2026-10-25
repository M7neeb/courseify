<script lang="ts">
  // Hash playground: type a text, see its SHA-256 fingerprint; change one letter and watch about
  // half of the 256 bits flip. Everything is computed on this device.
  import { bitDiff, sha256Hex } from '../../core/security.ts';
  import { tIn } from '../../i18n/i18n.ts';

  let { lang }: { lang: string } = $props();
  const tr = (key: string, vars: Record<string, string | number> = {}) => tIn(lang, key, vars);

  let a = $state('Courseify');
  let b = $state('courseify');
  let hashA = $state('');
  let hashB = $state('');

  $effect(() => {
    const [x, y] = [a, b];
    void Promise.all([sha256Hex(x), sha256Hex(y)]).then(([ha, hb]) => {
      if (x === a && y === b) {
        hashA = ha;
        hashB = hb;
      }
    });
  });

  const diff = $derived(hashA && hashB ? bitDiff(hashA, hashB) : 0);
  const same = $derived(a === b);
  const cells = (hex: string, other: string) => [...hex].map((ch, i) => ({ ch, differs: ch !== other[i] }));
</script>

<div class="hash-play">
  <p class="muted">{tr('hash.intro')}</p>
  <label class="hash-field">
    <span>{tr('hash.textA')}</span>
    <input type="text" bind:value={a} autocomplete="off" spellcheck="false" />
  </label>
  <p class="drill-mono hash-out" data-testid="hash-a">
    {#each cells(hashA, hashB) as c, i (i)}<span class:hash-diff={!same && c.differs}>{c.ch}</span>{/each}
  </p>
  <label class="hash-field">
    <span>{tr('hash.textB')}</span>
    <input type="text" bind:value={b} autocomplete="off" spellcheck="false" />
  </label>
  <p class="drill-mono hash-out" data-testid="hash-b">
    {#each cells(hashB, hashA) as c, i (i)}<span class:hash-diff={!same && c.differs}>{c.ch}</span>{/each}
  </p>
  <p class="hash-result" role="status" aria-live="polite">
    {#if same}{tr('hash.same')}{:else}{tr('hash.diff', { n: diff, percent: Math.round((diff / 256) * 100) })}{/if}
  </p>
  <ul class="muted small">
    <li>{tr('hash.point1')}</li>
    <li>{tr('hash.point2')}</li>
    <li>{tr('hash.point3')}</li>
  </ul>
</div>
