// The ONLY file that talks to IndexedDB. Everything else goes through `storage`.
// To add cloud sync later, change what happens in here; no screen needs to know.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ActivityDay } from './activity.ts';
import type { Backup, ChessRecord, Course, CourseMastery, CourseMeta, CourseProgress, SavedGame, Settings, TrashedCourse } from './types.ts';
import { USERDATA_SCHEMA_VERSION } from './types.ts';
import { mergeSettings } from './settings.ts';

interface CourseAppDB extends DBSchema {
  courses: { key: string; value: Course };
  progress: { key: string; value: CourseProgress };
  courseMeta: { key: string; value: CourseMeta };
  activity: { key: string; value: ActivityDay };
  trash: { key: string; value: TrashedCourse };
  mastery: { key: string; value: CourseMastery };
  games: { key: string; value: SavedGame };
  kv: { key: string; value: unknown };
}

export const DB_VERSION = 5;

let dbPromise: Promise<IDBPDatabase<CourseAppDB>> | null = null;

function db(): Promise<IDBPDatabase<CourseAppDB>> {
  // Version 2 added the `activity` store; version 3 added `trash`; version 4 added `mastery`;
  // version 5 added `games` (chess games against the bots).
  // Existing databases keep their data and each new store is created only when the old database
  // predates it.
  // The database keeps its original name so existing progress survives the rename to Courseify.
  dbPromise ??= openDB<CourseAppDB>('course-app', DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('courses', { keyPath: 'id' });
        database.createObjectStore('progress', { keyPath: 'courseId' });
        database.createObjectStore('courseMeta', { keyPath: 'courseId' });
        database.createObjectStore('kv');
      }
      if (oldVersion < 2) {
        database.createObjectStore('activity', { keyPath: 'day' });
      }
      if (oldVersion < 3) {
        database.createObjectStore('trash', { keyPath: 'courseId' });
      }
      if (oldVersion < 4) {
        database.createObjectStore('mastery', { keyPath: 'courseId' });
      }
      if (oldVersion < 5) {
        database.createObjectStore('games', { keyPath: 'id' });
      }
    }
  });
  return dbPromise;
}

export const storage = {
  async listCourses(): Promise<Course[]> {
    return (await db()).getAll('courses');
  },
  async saveCourse(course: Course): Promise<void> {
    await (await db()).put('courses', course);
  },
  async deleteCourse(id: string): Promise<void> {
    const d = await db();
    const tx = d.transaction(['courses', 'progress', 'courseMeta', 'mastery'], 'readwrite');
    await Promise.all([
      tx.objectStore('courses').delete(id),
      tx.objectStore('progress').delete(id),
      tx.objectStore('courseMeta').delete(id),
      tx.objectStore('mastery').delete(id),
      tx.done
    ]);
  },

  async listProgress(): Promise<CourseProgress[]> {
    return (await db()).getAll('progress');
  },
  async saveProgress(p: CourseProgress): Promise<void> {
    await (await db()).put('progress', p);
  },

  async listMeta(): Promise<CourseMeta[]> {
    return (await db()).getAll('courseMeta');
  },
  async saveMeta(m: CourseMeta): Promise<void> {
    await (await db()).put('courseMeta', m);
  },

  async listMastery(): Promise<CourseMastery[]> {
    return (await db()).getAll('mastery');
  },
  async saveMastery(m: CourseMastery): Promise<void> {
    await (await db()).put('mastery', m);
  },
  async deleteMastery(courseId: string): Promise<void> {
    await (await db()).delete('mastery', courseId);
  },

  async listActivity(): Promise<ActivityDay[]> {
    return (await db()).getAll('activity');
  },
  async saveActivity(day: ActivityDay): Promise<void> {
    // `activity` uses `day` as its inline key path, so IndexedDB derives the
    // key from the value. Supplying a separate key here causes a DataError.
    await (await db()).put('activity', day);
  },

  async listTrash(): Promise<TrashedCourse[]> {
    return (await db()).getAll('trash');
  },
  async saveTrash(item: TrashedCourse): Promise<void> {
    await (await db()).put('trash', item);
  },
  async deleteTrash(courseId: string): Promise<void> {
    await (await db()).delete('trash', courseId);
  },

  async listGames(): Promise<SavedGame[]> {
    return (await db()).getAll('games');
  },
  async saveGame(game: SavedGame): Promise<void> {
    await (await db()).put('games', game);
  },
  async deleteGame(id: string): Promise<void> {
    await (await db()).delete('games', id);
  },

  async getChess(): Promise<ChessRecord> {
    const saved = (await (await db()).get('kv', 'chess')) as ChessRecord | undefined;
    return { endgames: { ...(saved?.endgames ?? {}) } };
  },
  async saveChess(record: ChessRecord): Promise<void> {
    await (await db()).put('kv', record, 'chess');
  },

  /** Small records kept beside the settings: the week's starting snapshot and milestone dates. */
  async getRecord<T>(key: 'weekly' | 'milestones' | 'drills'): Promise<T | undefined> {
    return (await (await db()).get('kv', key)) as T | undefined;
  },
  async saveRecord(key: 'weekly' | 'milestones' | 'drills', value: unknown): Promise<void> {
    await (await db()).put('kv', value, key);
  },

  async getSettings(): Promise<Settings> {
    const saved = await (await db()).get('kv', 'settings');
    return mergeSettings(saved);
  },
  async saveSettings(s: Settings): Promise<void> {
    await (await db()).put('kv', s, 'settings');
  },

  async exportBackup(): Promise<Backup> {
    const [courses, progress, courseMeta, settings, activity, trash, mastery, games, chess] = await Promise.all([
      this.listCourses(),
      this.listProgress(),
      this.listMeta(),
      this.getSettings(),
      this.listActivity(),
      this.listTrash(),
      this.listMastery(),
      this.listGames(),
      this.getChess()
    ]);
    return {
      kind: 'course-app-backup',
      schemaVersion: USERDATA_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      courses,
      progress,
      courseMeta,
      settings,
      mastery,
      activity,
      trash,
      games,
      chess
    };
  },

  /** Restores a backup. Items with the same id are replaced; everything else is kept. */
  async importBackup(b: Backup): Promise<void> {
    const d = await db();
    const tx = d.transaction(['courses', 'progress', 'courseMeta', 'activity', 'trash', 'mastery', 'games', 'kv'], 'readwrite');
    const jobs: Promise<unknown>[] = [tx.done];
    for (const c of b.courses) jobs.push(tx.objectStore('courses').put(c));
    for (const p of b.progress) jobs.push(tx.objectStore('progress').put(p));
    for (const m of b.courseMeta) jobs.push(tx.objectStore('courseMeta').put(m));
    for (const a of b.activity ?? []) jobs.push(tx.objectStore('activity').put(a));
    for (const t of b.trash ?? []) jobs.push(tx.objectStore('trash').put(t));
    for (const m of b.mastery ?? []) jobs.push(tx.objectStore('mastery').put(m));
    for (const g of b.games ?? []) jobs.push(tx.objectStore('games').put(g));
    if (b.chess) jobs.push(tx.objectStore('kv').put(b.chess, 'chess'));
    jobs.push(tx.objectStore('kv').put(b.settings, 'settings'));
    await Promise.all(jobs);
  },

  /** Asks the browser not to evict this site's data when the device is low on space. */
  async requestPersistence(): Promise<boolean> {
    try {
      if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
      if (navigator.storage?.persist) return await navigator.storage.persist();
    } catch {
      /* not supported */
    }
    return false;
  }
};

