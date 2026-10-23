import { test, expect, devices, type BrowserContext, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { CATALOG_INFO } from '../../src/core/catalogEntries.ts';

// Sync between a PC and a phone through Google Drive. Google is replaced by a fake: the sign-in page
// sends the app straight back with a token, and a small in-memory Drive keeps the one sync file.

const sampleCourse = fileURLToPath(new URL('../../examples/sample-course.json', import.meta.url));
const kindsCourse = fileURLToPath(new URL('../fixtures/new-kinds-course.json', import.meta.url));

interface FakeDrive {
  file: { id: string; version: number; bytes: Buffer } | null;
  uploads: number;
  prompts: string[];
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
};

async function fakeGoogle(context: BrowserContext, drive: FakeDrive) {
  // Sign-in: straight back to the app with a token, as Google does once the learner agreed.
  await context.route('https://accounts.google.com/**', async (route) => {
    const url = new URL(route.request().url());
    drive.prompts.push(url.searchParams.get('prompt') ?? '');
    const back = `${url.searchParams.get('redirect_uri')}#access_token=fake-token&token_type=Bearer&expires_in=3599&state=${url.searchParams.get('state')}`;
    await route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(back)})</script>` });
  });
  await context.route('https://oauth2.googleapis.com/**', (route) => route.fulfill({ status: 200, headers: CORS, body: '' }));
  await context.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    expect(req.headers().authorization).toBe('Bearer fake-token');
    const url = new URL(req.url());
    const json = (body: unknown) => route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (url.pathname === '/drive/v3/about') return json({ user: { emailAddress: 'learner@example.com' } });
    if (url.pathname === '/drive/v3/files' && req.method() === 'GET') {
      expect(url.searchParams.get('spaces')).toBe('appDataFolder');
      return json({ files: drive.file ? [{ id: drive.file.id, version: String(drive.file.version) }] : [] });
    }
    if (url.pathname.startsWith('/drive/v3/files/') && req.method() === 'GET') {
      if (url.searchParams.get('alt') === 'media') return route.fulfill({ status: 200, headers: CORS, body: drive.file!.bytes });
      return json({ version: String(drive.file!.version) });
    }
    if (url.pathname === '/upload/drive/v3/files' && req.method() === 'POST') {
      // multipart: the metadata part, then the gzip part.
      const body = req.postDataBuffer()!;
      const marker = Buffer.from('Content-Type: application/gzip\r\n\r\n');
      const start = body.indexOf(marker) + marker.length;
      const end = body.lastIndexOf(Buffer.from('\r\n--'));
      const meta = JSON.parse(body.subarray(body.indexOf(Buffer.from('{')), body.indexOf(Buffer.from('}\r\n')) + 1).toString());
      expect(meta.parents).toEqual(['appDataFolder']);
      drive.file = { id: 'file-1', version: 1, bytes: Buffer.from(body.subarray(start, end)) };
      drive.uploads += 1;
      return json({ id: 'file-1' });
    }
    if (url.pathname === '/upload/drive/v3/files/file-1' && req.method() === 'PATCH') {
      drive.file = { id: 'file-1', version: drive.file!.version + 1, bytes: req.postDataBuffer()! };
      drive.uploads += 1;
      return json({ id: 'file-1' });
    }
    return route.fulfill({ status: 404, headers: CORS, body: 'not faked' });
  });
}

/** What is in Drive right now: the course ids of the library. */
function driveCourses(drive: FakeDrive): string[] {
  const bytes = drive.file!.bytes;
  expect(bytes[0]).toBe(0x1f); // gzip
  const file = JSON.parse(gunzipSync(bytes).toString('utf8'));
  expect(file.kind).toBe('courseify-sync');
  return (file.data.courses as { id: string }[]).map((c) => c.id).sort();
}

async function importFile(page: Page, path: string, title: string) {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(path);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText(`Imported “${title}”.`)).toBeVisible();
}

async function syncNow(page: Page) {
  await page.goto('./#/settings');
  const card = page.getByTestId('sync-card');
  await card.getByRole('button', { name: 'Sync now' }).click();
  await expect(card.getByRole('button', { name: 'Sync now' })).toBeEnabled();
}

async function connect(page: Page) {
  await page.goto('./#/settings');
  await page.getByTestId('sync-card').getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(page.getByTestId('sync-card').getByText('Connected to Google Drive as learner@example.com.')).toBeVisible();
  await expect(page.getByTestId('sync-last')).toContainText('Last synced');
}

test('PC and phone stay in step through Google Drive', async ({ browser, context, page, browserName }) => {
  const drive: FakeDrive = { file: null, uploads: 0, prompts: [] };
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // The PC connects first: its library goes up to Drive.
  await fakeGoogle(context, drive);
  await importFile(page, sampleCourse, 'Networking basics');
  await connect(page);
  expect(drive.prompts).toEqual(['select_account']);
  expect(driveCourses(drive)).toEqual(['networking-basics']);

  // The phone connects: it gets the PC's course, adds one of its own and syncs.
  const phoneContext = await browser.newContext({
    ...(browserName === 'webkit' ? devices['iPhone 15'] : {}),
    baseURL: 'http://localhost:4173/',
    serviceWorkers: 'block',
    storageState: {
      cookies: [],
      origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'course-app:catalogSeen', value: JSON.stringify(CATALOG_INFO.map((e) => e.id)) }] }]
    }
  });
  await fakeGoogle(phoneContext, drive);
  const phone = await phoneContext.newPage();
  phone.on('pageerror', (err) => errors.push(err.message));
  await phone.goto('./#/settings');
  await connect(phone);
  await phone.goto('./#/library');
  await expect(phone.getByRole('heading', { name: 'Networking basics' }).first()).toBeVisible();
  await importFile(phone, kindsCourse, 'New question kinds');
  await syncNow(phone);
  expect(driveCourses(drive)).toEqual(['networking-basics', 'new-kinds']);

  // Back on the PC: opening the app pulls the phone's course in.
  await page.goto('./#/library');
  await page.reload();
  await expect(page.getByText('Updated with your progress from your other device.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New question kinds' }).first()).toBeVisible();

  // Deleting on the PC removes the course on the phone too (it waits in the phone's trash).
  const card = page.locator('.course-card, li, article').filter({ has: page.getByRole('heading', { name: 'New question kinds', exact: true }) }).filter({ has: page.getByLabel('More course actions') }).last();
  await card.getByLabel('More course actions').click();
  page.once('dialog', (dialog) => void dialog.accept());
  await card.getByRole('button', { name: 'Delete' }).click();
  await syncNow(page);
  expect(driveCourses(drive)).toEqual(['networking-basics']);
  await syncNow(phone);
  await phone.goto('./#/library');
  await expect(phone.getByRole('heading', { name: 'Networking basics' }).first()).toBeVisible();
  await expect(phone.getByRole('heading', { name: 'New question kinds' })).toHaveCount(0);
  await phone.goto('./#/trash');
  await expect(phone.getByText('New question kinds').first()).toBeVisible();

  // An hour later the token has run out: opening the app renews it quietly and syncs.
  await phone.evaluate(() => sessionStorage.removeItem('course-app:syncToken'));
  const uploadsBefore = drive.prompts.length;
  await phone.goto('./#/home');
  await phone.reload();
  await expect.poll(() => drive.prompts.slice(uploadsBefore)).toEqual(['none']);
  await expect(phone).toHaveURL(/#\/home$/);
  await phone.goto('./#/settings');
  await expect(phone.getByTestId('sync-card').getByText('Connected to Google Drive as learner@example.com.')).toBeVisible();

  await phoneContext.close();
  expect(errors).toEqual([]);
});
