// Courses that come with the app. Each one is loaded only when it is installed, so it never weighs
// on the first page load, and it is cached for offline use like the rest of the app.
import { CATALOG_INFO, type CatalogInfo } from './catalogEntries.ts';
import type { Course } from './types.ts';

export interface CatalogEntry extends CatalogInfo {
  load: () => Promise<Course>;
}

// Every file in courses/, found at build time: adding a course is a new file plus its entry.
const files = import.meta.glob<Course>('../../courses/*.json', { import: 'default' });

export const CATALOG: CatalogEntry[] = CATALOG_INFO.flatMap((info) => {
  const file = files[`../../courses/${info.id}.json`];
  return file ? [{ ...info, load: file }] : [];
});
