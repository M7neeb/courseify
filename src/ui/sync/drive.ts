// The few Google Drive calls sync needs, all inside the app's hidden folder ("appDataFolder").
// The file is gzip-compressed: the courses make up most of it and shrink to about a tenth.

import { SYNC_FILE_NAME } from './config.ts';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

/** Google turned the token down: sign in again. */
export class AuthError extends Error {}
/** Anything else that went wrong talking to Drive (offline, Google busy). */
export class DriveError extends Error {}

export interface RemoteFile {
  id: string;
  /** Goes up with every change, so a write from the other device can be noticed. */
  version: string;
}

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  } catch {
    throw new DriveError('network');
  }
  if (res.status === 401) throw new AuthError('expired');
  if (!res.ok) throw new DriveError(`http ${res.status}`);
  return res;
}

export async function findFile(token: string): Promise<RemoteFile | null> {
  const q = encodeURIComponent(`name='${SYNC_FILE_NAME}' and trashed=false`);
  const res = await call(token, `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,version)&orderBy=modifiedTime desc`);
  const body = (await res.json()) as { files?: { id: string; version?: string }[] };
  const file = body.files?.[0];
  return file ? { id: file.id, version: String(file.version ?? '') } : null;
}

export async function fileVersion(token: string, id: string): Promise<string> {
  const res = await call(token, `${API}/files/${encodeURIComponent(id)}?fields=version`);
  const body = (await res.json()) as { version?: string };
  return String(body.version ?? '');
}

export async function download(token: string, id: string): Promise<string> {
  const res = await call(token, `${API}/files/${encodeURIComponent(id)}?alt=media`);
  return unpack(new Uint8Array(await res.arrayBuffer()));
}

export async function upload(token: string, text: string, existing: RemoteFile | null): Promise<void> {
  const body = await pack(text);
  if (existing) {
    await call(token, `${UPLOAD}/files/${encodeURIComponent(existing.id)}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/gzip' },
      // Plain bytes rather than a Blob: every browser sends these the same way.
      body: await body.arrayBuffer()
    });
    return;
  }
  const boundary = `courseify${Date.now()}`;
  const meta = JSON.stringify({ name: SYNC_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/gzip' });
  const multipart = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
    body,
    `\r\n--${boundary}--`
  ]);
  await call(token, `${UPLOAD}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: await multipart.arrayBuffer()
  });
}

/** The Google account's address, to show which account is connected. Optional: null when not allowed. */
export async function accountEmail(token: string): Promise<string | null> {
  try {
    const res = await call(token, `${API}/about?fields=user(emailAddress)`);
    const body = (await res.json()) as { user?: { emailAddress?: string } };
    return body.user?.emailAddress ?? null;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    return null;
  }
}

async function pack(text: string): Promise<Blob> {
  const plain = new Blob([text], { type: 'application/json' });
  if (typeof CompressionStream === 'undefined') return plain;
  const stream = plain.stream().pipeThrough(new CompressionStream('gzip'));
  return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' });
}

/** Reads the file whether or not it was compressed (a browser without CompressionStream writes it plain). */
async function unpack(bytes: Uint8Array): Promise<string> {
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzip) return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream === 'undefined') throw new DriveError('gzip unsupported');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
