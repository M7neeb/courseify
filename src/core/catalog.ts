// Courses that come with the app. Each one is loaded only when it is added, so it never weighs on
// the first page load, and it is cached for offline use like the rest of the app.
import type { Course } from './types.ts';

export interface CatalogEntry {
  id: string;
  title: string;
  subject: string;
  summary: string;
  /** Matches the course's own `version`; a newer one offers an update that keeps progress. */
  version: string;
  lessons: number;
  load: () => Promise<Course>;
}

export const CATALOG: CatalogEntry[] = [
  {
    id: 'chess-to-1000',
    title: 'Chess: from improver to 1000',
    subject: 'Chess',
    summary: 'Stop losing pieces, win material with forks, pins and skewers, learn the mating patterns and the endgames, and play it all out on the board. 118 puzzles from real games.',
    version: '1.0',
    lessons: 17,
    load: async () => (await import('../../courses/chess-to-1000.json')).default as unknown as Course
  }
];
