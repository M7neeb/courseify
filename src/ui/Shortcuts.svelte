<script lang="ts">
  // The keyboard shortcuts, opened with "?" (or from Settings). A native modal dialog: it keeps
  // the focus inside and closes with Escape by itself.
  import { t } from '../i18n/i18n.ts';

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  const groups: { title: string; keys: [string, string][] }[] = $derived([
    { title: t('keys.everywhere'), keys: [['/', t('keys.search')], ['?', t('keys.this')], ['Esc', t('keys.close')]] },
    { title: t('keys.lesson'), keys: [['F', t('keys.focus')], ['← →', t('keys.prevNext')]] },
    { title: t('keys.quiz'), keys: [['1–9', t('keys.pick')], ['Enter', t('keys.check')]] },
    { title: t('keys.cards'), keys: [[t('keys.space'), t('keys.turn')], ['1', t('keys.again')], ['2', t('keys.know')]] }
  ]);
</script>

<dialog bind:this={dialog} class="cf-keys" aria-labelledby="keys-title" onclose={() => (open = false)}>
  <div class="cf-keys-head">
    <h2 id="keys-title">{t('keys.title')}</h2>
    <button type="button" class="cf-btn cf-btn-ghost cf-btn-small" onclick={() => (open = false)}>{t('keys.closeButton')}</button>
  </div>
  {#each groups as group (group.title)}
    <section>
      <h3>{group.title}</h3>
      <dl>
        {#each group.keys as [key, what] (key)}
          <div><dt><kbd>{key}</kbd></dt><dd>{what}</dd></div>
        {/each}
      </dl>
    </section>
  {/each}
</dialog>
