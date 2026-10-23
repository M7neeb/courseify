// Google sign-in for sync, by redirect: a Home Screen app on the iPhone cannot use sign-in pop-ups.
// The app goes to Google and Google sends it back with a one-hour access token in the address.
// No password ever reaches the app, and the token only opens the app's own hidden Drive folder.

import { DRIVE_SCOPE, GOOGLE_CLIENT_ID } from './config.ts';

const TOKEN_KEY = 'course-app:syncToken';
const PENDING_KEY = 'course-app:syncPending';
const ACCOUNT_KEY = 'course-app:syncAccount';

/** What this device remembers about sync between visits. */
export interface SyncAccount {
  connected: boolean;
  email?: string;
  lastSyncAt?: string;
  /** Google wants the learner to sign in again (the quiet renewal was refused). */
  needsSignIn?: boolean;
}

interface Pending {
  nonce: string;
  returnHash: string;
  silent: boolean;
}

/** How the last trip to Google ended, read once by the sync module on start. */
export type RedirectOutcome = 'connected' | 'renewed' | 'refused' | 'needsSignIn';
let outcome: RedirectOutcome | null = null;

export function takeRedirectOutcome(): RedirectOutcome | null {
  const value = outcome;
  outcome = null;
  return value;
}

/** Reads Google's answer out of the address (if there is one) and puts the learner back where they were. */
export function takeRedirect(): void {
  if (typeof location === 'undefined' || !/[#&](access_token|error)=/.test(location.hash)) return;
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const pending = readJson<Pending>(localStorage, PENDING_KEY);
  remove(localStorage, PENDING_KEY);
  const back = pending?.returnHash && pending.returnHash.startsWith('#/') ? pending.returnHash : '#/settings';
  history.replaceState(null, '', location.pathname + location.search + back);
  // Only an answer to a request this app made counts.
  if (!pending || params.get('state') !== pending.nonce) return;
  const token = params.get('access_token');
  if (token) {
    const seconds = Number(params.get('expires_in') ?? 3600);
    writeJson(sessionStorage, TOKEN_KEY, { token, expiresAt: Date.now() + Math.max(60, seconds - 60) * 1000 });
    saveAccount({ ...loadAccount(), connected: true, needsSignIn: false });
    outcome = pending.silent ? 'renewed' : 'connected';
  } else {
    if (pending.silent) saveAccount({ ...loadAccount(), needsSignIn: true });
    outcome = pending.silent ? 'needsSignIn' : 'refused';
  }
}

/**
 * Goes to Google. `silent` asks without showing anything (works while the learner is still signed in
 * to Google and already allowed the app); otherwise Google shows its account and permission screens.
 */
export function signIn(silent: boolean): void {
  const nonce = randomId();
  const returnHash = location.hash.startsWith('#/') ? location.hash : '#/home';
  writeJson<Pending>(localStorage, PENDING_KEY, { nonce, returnHash, silent });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: location.origin + location.pathname,
    response_type: 'token',
    scope: DRIVE_SCOPE,
    include_granted_scopes: 'true',
    state: nonce,
    prompt: silent ? 'none' : 'select_account'
  });
  const email = loadAccount().email;
  if (email) params.set('login_hint', email);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

/** The access token while it is still valid. */
export function accessToken(): string | null {
  const saved = readJson<{ token: string; expiresAt: number }>(sessionStorage, TOKEN_KEY);
  if (!saved || typeof saved.token !== 'string' || !(saved.expiresAt > Date.now())) return null;
  return saved.token;
}

/** Forgets the token (Google said it is no longer valid). */
export function dropToken(): void {
  remove(sessionStorage, TOKEN_KEY);
}

/** Disconnects this device. The data in Drive stays, so connecting again picks it up. */
export async function signOut(): Promise<void> {
  const token = accessToken();
  dropToken();
  saveAccount({ connected: false });
  if (!token) return;
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' });
  } catch {
    /* offline: the token runs out within the hour anyway */
  }
}

export function loadAccount(): SyncAccount {
  const saved = readJson<SyncAccount>(localStorage, ACCOUNT_KEY);
  return saved && typeof saved === 'object' ? { ...saved, connected: saved.connected === true } : { connected: false };
}

export function saveAccount(account: SyncAccount): void {
  writeJson(localStorage, ACCOUNT_KEY, account);
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readJson<T>(store: Storage, key: string): T | null {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson<T>(store: Storage, key: string, value: T): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: sync works for this visit only */
  }
}

function remove(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    /* nothing to remove */
  }
}
