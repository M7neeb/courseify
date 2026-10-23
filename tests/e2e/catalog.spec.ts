import { test, expect } from '@playwright/test';
import { CATALOG_INFO } from '../../src/core/catalogEntries.ts';

// A first start with nothing stored: every course that comes with the app is in the library.
test.use({ storageState: { cookies: [], origins: [] } });

test('the courses that come with the app are installed on the first start, and a removed one stays removed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./#/library');
  for (const entry of CATALOG_INFO) {
    await expect(page.getByRole('main').getByRole('heading', { name: entry.title, exact: true }).first()).toBeVisible();
  }
  // In the library already, so the ready-made list has nothing left to add.
  await expect(page.getByRole('button', { name: 'Add to my courses' })).toHaveCount(0);
  await expect(page.getByText('In your library', { exact: true })).toHaveCount(CATALOG_INFO.length);

  // Deleting one moves it to the trash, and a new start does not put it back: it is offered instead.
  const card = page.locator('.course-card, li, article').filter({ has: page.getByRole('heading', { name: 'Das Pflichtenheft verstehen', exact: true }) }).filter({ has: page.getByLabel('More course actions') }).last();
  await card.getByLabel('More course actions').click();
  page.once('dialog', (dialog) => void dialog.accept());
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add to my courses' })).toHaveCount(1);
  await expect(page.locator('.cf-catalog-item', { hasText: 'Das Pflichtenheft verstehen' }).getByRole('button', { name: 'Add to my courses' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a built-in course from an older app version updates by itself and keeps its progress', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const entry = CATALOG_INFO.find((e) => e.id === 'pflichtenheft')!;
  await page.goto('./#/library');
  await expect(page.getByRole('main').getByRole('heading', { name: entry.title, exact: true }).first()).toBeVisible();
  // Make the installed copy look like it came with an older app, with a lesson done.
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('course-app');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['courses', 'progress'], 'readwrite');
    const courses = tx.objectStore('courses');
    const get = courses.get(id);
    await new Promise((r) => (get.onsuccess = r));
    const course = get.result;
    const firstLesson = course.modules[0].lessons[0].id;
    courses.put({ ...course, version: 0.5, title: 'Old title' });
    tx.objectStore('progress').put({ courseId: id, courseVersion: 0.5, completedLessons: [firstLesson], answers: {}, videoOverrides: {}, lastOpened: new Date().toISOString() });
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
  }, entry.id);
  await page.reload();
  await expect(page.getByText(`Updated to the new version: ${entry.title}. Your progress is kept.`)).toBeVisible();
  await expect(page.getByRole('main').getByRole('heading', { name: entry.title, exact: true }).first()).toBeVisible();
  const kept = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('course-app');
      req.onsuccess = () => resolve(req.result);
    });
    const get = db.transaction('progress').objectStore('progress').get(id);
    await new Promise((r) => (get.onsuccess = r));
    db.close();
    return get.result.completedLessons.length;
  }, entry.id);
  expect(kept).toBe(1);
  expect(errors).toEqual([]);
});
