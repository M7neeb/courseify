<script lang="ts">
  // Settings card: connect Google Drive, sync now, and when this device last synced.
  import { app } from '../../core/state.svelte.ts';
  import { t } from '../../i18n/i18n.ts';
  import { connect, disconnect, sync, syncNow } from './sync.svelte.ts';

  const locale = $derived(app.settings.uiLanguage === 'de' ? 'de-DE' : 'en-GB');
  const lastText = $derived.by(() => {
    const at = sync.account.lastSyncAt;
    if (!at) return t('sync.never');
    const when = new Date(at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return t('sync.last', { when });
  });
  const statusText = $derived.by(() => {
    switch (sync.status) {
      case 'syncing':
        return t('sync.status.syncing');
      case 'offline':
        return t('sync.status.offline');
      case 'error':
        return t('sync.status.error');
      case 'needsSignIn':
        return t('sync.status.needsSignIn');
      case 'newerApp':
        return t('sync.newerApp');
      default:
        return '';
    }
  });
</script>

<fieldset class="cf-sync" data-testid="sync-card">
  <legend>{t('sync.title')}</legend>
  {#if !sync.configured}
    <p class="muted">{t('sync.notSetUp')}</p>
  {:else if !sync.account.connected}
    <p class="muted">{t('sync.hint')}</p>
    <div class="row">
      <button type="button" class="btn primary" onclick={connect}>{t('sync.connect')}</button>
    </div>
    <p class="muted small">{t('sync.privacy')}</p>
  {:else}
    <p>{sync.account.email ? t('sync.connectedAs', { email: sync.account.email }) : t('sync.connectedPlain')}</p>
    <p class="muted small" data-testid="sync-last">{lastText}</p>
    {#if statusText}<p class="small" class:warn={sync.status !== 'syncing'} role="status">{statusText}</p>{/if}
    <div class="row">
      <button type="button" class="btn primary" disabled={sync.status === 'syncing'} onclick={() => syncNow({ reason: 'manual' })}>
        {sync.status === 'syncing' ? t('sync.status.syncing') : t('sync.now')}
      </button>
      <button type="button" class="btn" onclick={disconnect}>{t('sync.disconnect')}</button>
    </div>
    <p class="muted small">{t('sync.auto')}</p>
  {/if}
</fieldset>

<style>
  .warn {
    color: var(--warn, #b45309);
  }
</style>
