<script lang="ts">
  // Password strength: a teaching model. What is typed stays in this field and is never sent or saved.
  import { passwordStrength, spanParts } from '../../core/security.ts';
  import { tIn } from '../../i18n/i18n.ts';

  let { lang }: { lang: string } = $props();
  const tr = (key: string, vars: Record<string, string | number> = {}) => tIn(lang, key, vars);

  let pw = $state('');
  let visible = $state(false);
  const s = $derived(passwordStrength(pw));
  const span = $derived(spanParts(s.seconds));
  const percent = $derived(Math.min(100, Math.round((s.bits / 90) * 100)));
</script>

<div class="pw-meter">
  <p class="muted">{tr('pw.intro')}</p>
  <label class="hash-field">
    <span>{tr('pw.field')}</span>
    <span class="pw-row">
      <input type={visible ? 'text' : 'password'} aria-label={tr('pw.field')} bind:value={pw} autocomplete="off" autocapitalize="off" spellcheck="false" />
      <button type="button" class="btn" onclick={() => (visible = !visible)}>{visible ? tr('pw.hide') : tr('pw.show')}</button>
    </span>
  </label>
  {#if pw}
    <div class="cf-goal">
      <span class="cf-progress" role="progressbar" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100" aria-label={tr('pw.strength')}>
        <span style:width={percent + '%'} class={'pw-' + s.label}></span>
      </span>
      <span class="cf-small" data-testid="pw-label">{tr('pw.label.' + s.label)} · {tr('pw.bits', { n: s.bits })}</span>
    </div>
    <p>
      {#if span.unit === 'instant'}{tr('pw.time.instant')}
      {:else if span.unit === 'huge'}{tr('pw.time.huge')}
      {:else}{tr('pw.time.' + span.unit, { n: span.n })}{/if}
    </p>
    {#if s.issues.length}
      <ul class="pw-issues">
        {#each s.issues as issue (issue)}<li>{tr('pw.issue.' + issue)}</li>{/each}
      </ul>
    {/if}
  {/if}
  <p class="muted small">{tr('pw.note')}</p>
</div>
