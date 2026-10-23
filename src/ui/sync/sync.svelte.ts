// Keeps the PC and the phone in step through the learner's Google Drive. A sync downloads the Drive
// copy, merges it with this device's data (core/syncMerge.ts), saves the result here and uploads it.
// It runs when the app opens, when it goes to the background after a change, and on "Sync now".

import { storage } from '../../core/storage.ts';
import { canonical, mergeSyncData, parseSyncFile, sameData, SYNC_FORMAT_VERSION, SYNCED_EVENT, type SyncData, type SyncFile } from '../../core/syncMerge.ts';
import { USERDATA_SCHEMA_VERSION } from '../../core/types.ts';
import { reloadAll, showToast } from '../../core/state.svelte.ts';
import { t } from '../../i18n/i18n.ts';
import { accessToken, dropToken, loadAccount, saveAccount, signIn, signOut, takeRedirectOutcome, type SyncAccount } from './auth.ts';
import { syncConfigured } from './config.ts';
import { accountEmail, AuthError, download, fileVersion, findFile, upload } from './drive.ts';

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'offline' | 'error' | 'needsSignIn' | 'newerApp';

export const sync = $state({
  configured: syncConfigured(),
  account: loadAccount() as SyncAccount,
  status: 'idle' as SyncStatus
});

const DEVICE_KEY = 'course-app:deviceId';
const SILENT_KEY = 'course-app:syncSilentAt';
/** A quiet trip to Google to renew the token happens at most this often. */
const SILENT_GAP_MS = 10 * 60 * 1000;

let running: Promise<void> | null = null;
let writesAtLastSync = -1;

function setAccount(patch: Partial<SyncAccount>): void {
  sync.account = { ...sync.account, ...patch };
  saveAccount($state.snapshot(sync.account) as SyncAccount);
}

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

/** Called once when the app has loaded its data: finishes a sign-in and syncs. */
export function startSync(): void {
  if (!sync.configured) return;
  const outcome = takeRedirectOutcome();
  sync.account = loadAccount();
  if (outcome === 'connected') showToast(t('sync.connected'));
  if (outcome === 'refused') showToast(t('sync.refused'));
  if (outcome === 'needsSignIn') {
    sync.status = 'needsSignIn';
    showToast(t('sync.needsSignIn'));
  }
  if (!sync.account.connected) return;
  void syncNow({ reason: 'open' });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void syncNow({ reason: 'hide' });
    else void syncNow({ reason: 'show' });
  });
  window.addEventListener('online', () => void syncNow({ reason: 'show' }));
}

/** Connects this device: off to Google, back with a token, then the first sync. */
export function connect(): void {
  signIn(false);
}

export async function disconnect(): Promise<void> {
  await signOut();
  sync.account = loadAccount();
  sync.status = 'idle';
}

type Reason = 'open' | 'show' | 'hide' | 'manual';

/** Runs one sync (or joins the one already running). */
export function syncNow({ reason }: { reason: Reason }): Promise<void> {
  if (!sync.configured || !sync.account.connected) return Promise.resolve();
  // Going to the background with nothing new to send: nothing to do.
  if (reason === 'hide' && storage.writeCount() === writesAtLastSync) return Promise.resolve();
  // Coming back to the app shortly after a sync: the other device has hardly had a chance to change things.
  if (reason === 'show' && recentlySynced(5 * 60 * 1000)) return Promise.resolve();
  running ??= run(reason).finally(() => {
    running = null;
  });
  return running;
}

function recentlySynced(ms: number): boolean {
  const last = sync.account.lastSyncAt ? Date.parse(sync.account.lastSyncAt) : 0;
  return Date.now() - last < ms;
}

async function run(reason: Reason): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    sync.status = 'offline';
    if (reason === 'manual') showToast(t('sync.offline'));
    return;
  }
  const token = accessToken();
  if (!token) {
    renewToken(reason);
    return;
  }
  sync.status = 'syncing';
  try {
    const pulled = await exchange(token);
    if (!sync.account.email) {
      const email = await accountEmail(token);
      if (email) setAccount({ email });
    }
    setAccount({ lastSyncAt: new Date().toISOString(), needsSignIn: false });
    sync.status = 'ok';
    if (pulled && reason !== 'hide') showToast(t('sync.pulled'));
    else if (reason === 'manual') showToast(t('sync.done'));
  } catch (e) {
    if (e instanceof AuthError) {
      dropToken();
      renewToken(reason);
      return;
    }
    if (e instanceof NewerAppError) {
      sync.status = 'newerApp';
      if (reason !== 'hide') showToast(t('sync.newerApp'));
      return;
    }
    sync.status = 'error';
    if (reason === 'manual' || reason === 'open') showToast(t('sync.failed'));
  }
}

/** Without a valid token: on opening the app, ask Google quietly; when the learner taps, ask openly. */
function renewToken(reason: Reason): void {
  if (reason === 'manual') {
    signIn(false);
    return;
  }
  // Leaving the app: nothing can be shown now; the next open renews quietly.
  if (reason === 'hide') return;
  if (sync.account.needsSignIn) {
    sync.status = 'needsSignIn';
    return;
  }
  let last = 0;
  try {
    last = Number(localStorage.getItem(SILENT_KEY) ?? 0);
    localStorage.setItem(SILENT_KEY, String(Date.now()));
  } catch {
    /* storage blocked */
  }
  if (Date.now() - last < SILENT_GAP_MS) {
    sync.status = 'needsSignIn';
    return;
  }
  signIn(true);
}

class NewerAppError extends Error {}

/** Download, merge, save, upload. Starts over (twice at most) if something changed in between. */
async function exchange(token: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const writesBefore = storage.writeCount();
    const local = canonical(await storage.exportSyncData());
    const remoteFile = await findFile(token);
    let remote: SyncData | null = null;
    if (remoteFile) {
      const parsed = parseSyncFile(await download(token, remoteFile.id));
      if (!parsed.ok && parsed.reason === 'newer') throw new NewerAppError('newer');
      // An unreadable file is replaced by this device's data, which is complete on its own.
      if (parsed.ok) remote = parsed.file.data;
    }
    const merged = remote ? mergeSyncData(local, remote) : local;
    const localChanged = !sameData(merged, local);
    const remoteChanged = !remote || !sameData(merged, remote);

    if (localChanged) {
      // The learner saved something while this merge ran: merge again so it is not lost.
      if (storage.writeCount() !== writesBefore) continue;
      await storage.applySyncData(merged);
      await reloadAll();
      window.dispatchEvent(new CustomEvent(SYNCED_EVENT));
    }
    if (remoteChanged) {
      // The other device uploaded meanwhile: merge again with its copy.
      if (remoteFile && (await fileVersion(token, remoteFile.id)) !== remoteFile.version) continue;
      const file: SyncFile = {
        kind: 'courseify-sync',
        formatVersion: SYNC_FORMAT_VERSION,
        userDataVersion: USERDATA_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        deviceId: deviceId(),
        data: merged
      };
      await upload(token, JSON.stringify(file), remoteFile);
    }
    writesAtLastSync = storage.writeCount();
    return localChanged;
  }
  throw new Error('busy');
}
