<script lang="ts">
  import { app, navigate, updateSettings } from '../../core/state.svelte.ts';
  import { t } from '../../i18n/i18n.ts';

  const displayName = $derived(app.settings.profileName.trim() || t('profile.defaultName'));
  const initials = $derived(displayName.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toLocaleUpperCase());
</script>

<section class="stack profile-page">
  <div class="page-head">
    <div><h1>{t('profile.title')}</h1><p class="muted">{t('profile.subtitle')}</p></div>
  </div>
  <div class="profile-edit-layout">
    <div class="profile-preview">
      <span class="profile-avatar profile-avatar-large" style:background={app.settings.profileColor}>{initials}</span>
      <h2>{displayName}</h2>
      <p class="muted small">{t('profile.localOnly')}</p>
    </div>
    <fieldset>
      <legend>{t('profile.customize')}</legend>
      <label>{t('profile.name')}
        <input type="text" maxlength="48" value={app.settings.profileName} placeholder={t('profile.nameHint')} oninput={(event) => updateSettings({ profileName: event.currentTarget.value })} />
      </label>
      <label class="profile-color-label">{t('profile.avatarColor')}
        <span class="profile-color-control"><input type="color" value={app.settings.profileColor} aria-label={t('profile.avatarColor')} onchange={(event) => updateSettings({ profileColor: event.currentTarget.value })} /></span>
      </label>
      <label>{t('profile.username')}
        <input type="text" maxlength="32" value={app.settings.username ?? ''} placeholder={t('profile.usernameHint')} oninput={(event) => updateSettings({ username: event.currentTarget.value })} />
      </label>
      <label>{t('profile.bio')}
        <input type="text" maxlength="160" value={app.settings.bio ?? ''} placeholder={t('profile.bioHint')} oninput={(event) => updateSettings({ bio: event.currentTarget.value })} />
      </label>
    </fieldset>
  </div>
</section>
