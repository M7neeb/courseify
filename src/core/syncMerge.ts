// Combines this device's data with the copy in Google Drive, so the PC and the phone can both be used
// between syncs without either one overwriting the other. Pure logic: no storage, no network.

import type { ActivityDay } from './activity.ts';
import type {
  AnswerRecord,
  Backup,
  ChessRecord,
  Course,
  CourseMastery,
  CourseMeta,
  CourseProgress,
  MistakeLogEntry,
  Reflection,
  ReviewCard,
  SavedGame,
  Settings,
  SkillMastery,
  TrashedCourse
} from './types.ts';
import { analyzeImport } from './import.ts';
import { USERDATA_SCHEMA_VERSION } from './types.ts';
import { MASTERY } from './mastery.ts';
import { isExpired } from './trash.ts';
import { normalizeProgress } from './progress.ts';
import { DEVICE_SETTINGS } from './settings.ts';

/** Fired on window after a sync changed this device's data, so stores holding their own copy reload. */
export const SYNCED_EVENT = 'courseify:synced';

/** Bumped only when the sync file changes in a way older apps cannot read. */
export const SYNC_FORMAT_VERSION = 1;

/** Drill stats as the Drills page keeps them (same shape as `DrillStat`). */
export interface SyncDrillStat {
  solved: number;
  best: number;
  level?: 1 | 2 | 3;
}

/** Everything that is synced: a backup plus the small records a backup leaves out. */
export interface SyncData {
  courses: Course[];
  progress: CourseProgress[];
  courseMeta: CourseMeta[];
  settings: Settings;
  mastery: CourseMastery[];
  activity: ActivityDay[];
  trash: TrashedCourse[];
  games: SavedGame[];
  chess: ChessRecord;
  drills: Record<string, SyncDrillStat>;
  /** Milestone id -> the date it was first earned. */
  milestones: Record<string, string>;
  /** Things deleted for good ("game:<id>") -> when, so the other device does not bring them back. */
  tombstones: Record<string, string>;
}

export interface SyncFile {
  kind: 'courseify-sync';
  formatVersion: number;
  /** The saved-data version of the app that wrote it (`USERDATA_SCHEMA_VERSION`). */
  userDataVersion: number;
  updatedAt: string;
  deviceId: string;
  data: SyncData;
}


/** Tombstones older than this are dropped: both devices have long seen them by then. */
const TOMBSTONE_DAYS = 180;

// ---------- reading a sync file ----------

export type ParsedSync = { ok: true; file: SyncFile } | { ok: false; reason: 'format' | 'newer' };

/** Reads a downloaded sync file, running the same checks and migrations as a backup restore. */
export function parseSyncFile(text: string): ParsedSync {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'format' };
  }
  if (!isObject(raw) || raw.kind !== 'courseify-sync' || !isObject(raw.data)) return { ok: false, reason: 'format' };
  if (typeof raw.formatVersion !== 'number') return { ok: false, reason: 'format' };
  if (raw.formatVersion > SYNC_FORMAT_VERSION) return { ok: false, reason: 'newer' };
  const data = raw.data;
  // Older apps' saved shapes are brought up to date by the same migrations a backup restore uses.
  const userDataVersion = typeof raw.userDataVersion === 'number' ? raw.userDataVersion : USERDATA_SCHEMA_VERSION;
  const analysis = analyzeImport(JSON.stringify({ ...data, kind: 'course-app-backup', schemaVersion: userDataVersion }));
  if (analysis.kind !== 'backup') return { ok: false, reason: 'format' };
  const b = analysis.backup;
  return {
    ok: true,
    file: {
      kind: 'courseify-sync',
      formatVersion: raw.formatVersion,
      userDataVersion: USERDATA_SCHEMA_VERSION,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
      deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : '',
      data: {
        courses: b.courses,
        progress: b.progress,
        courseMeta: b.courseMeta,
        settings: b.settings,
        mastery: b.mastery ?? [],
        activity: b.activity ?? [],
        trash: b.trash ?? [],
        games: b.games ?? [],
        chess: b.chess ?? { endgames: {} },
        drills: readDrills(data.drills),
        milestones: readStringMap(data.milestones),
        tombstones: readStringMap(data.tombstones)
      }
    }
  };
}

/** The data part of a backup, for building the sync data from local storage. */
export function syncDataFrom(
  backup: Backup,
  extra: { drills?: unknown; milestones?: unknown; tombstones?: unknown }
): SyncData {
  return {
    courses: backup.courses,
    // Read the same way a downloaded file is read, so equal data compares equal.
    progress: backup.progress.map(normalizeProgress).filter((p): p is CourseProgress => p !== null),
    courseMeta: backup.courseMeta,
    settings: backup.settings,
    mastery: backup.mastery ?? [],
    activity: backup.activity ?? [],
    trash: backup.trash ?? [],
    games: backup.games ?? [],
    chess: backup.chess ?? { endgames: {} },
    drills: readDrills(extra.drills),
    milestones: readStringMap(extra.milestones),
    tombstones: readStringMap(extra.tombstones)
  };
}

function readDrills(raw: unknown): Record<string, SyncDrillStat> {
  const out: Record<string, SyncDrillStat> = {};
  if (!isObject(raw)) return out;
  for (const [id, value] of Object.entries(raw)) {
    if (!isObject(value)) continue;
    const stat: SyncDrillStat = { solved: count(value.solved), best: count(value.best) };
    if (value.level === 1 || value.level === 2 || value.level === 3) stat.level = value.level;
    out[id] = stat;
  }
  return out;
}

function readStringMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObject(raw)) return out;
  for (const [key, value] of Object.entries(raw)) if (typeof value === 'string') out[key] = value;
  return out;
}

// ---------- merging ----------

/**
 * Merges this device's data (`local`) with the Drive copy (`remote`). On a true tie the local copy
 * wins, so syncing twice in a row changes nothing.
 */
export function mergeSyncData(local: SyncData, remote: SyncData, now: Date = new Date()): SyncData {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones, now);
  const courseState = mergeCourses(local, remote, now);
  const out: SyncData = {
    ...courseState,
    settings: mergeSettingsRecord(local.settings, remote.settings),
    activity: mergeActivity(local.activity, remote.activity),
    games: mergeGames(local.games, remote.games, tombstones),
    chess: mergeChess(local.chess, remote.chess),
    drills: mergeDrills(local.drills, remote.drills),
    milestones: mergeMilestones(local.milestones, remote.milestones),
    tombstones
  };
  return canonical(out);
}

type Side = 'local' | 'remote';
type CourseState = { kind: 'active' | 'trash'; at: string } | null;

function byId<T>(items: T[], key: (item: T) => string): Map<string, T> {
  return new Map(items.map((item) => [key(item), item]));
}

/** Courses, their progress, mastery and meta, and the trash, decided course by course. */
function mergeCourses(local: SyncData, remote: SyncData, now: Date): Pick<SyncData, 'courses' | 'progress' | 'courseMeta' | 'mastery' | 'trash'> {
  const sides = {
    local: {
      courses: byId(local.courses, (c) => c.id),
      progress: byId(local.progress, (p) => p.courseId),
      meta: byId(local.courseMeta, (m) => m.courseId),
      mastery: byId(local.mastery, (m) => m.courseId),
      trash: byId(local.trash, (t) => t.courseId)
    },
    remote: {
      courses: byId(remote.courses, (c) => c.id),
      progress: byId(remote.progress, (p) => p.courseId),
      meta: byId(remote.courseMeta, (m) => m.courseId),
      mastery: byId(remote.mastery, (m) => m.courseId),
      trash: byId(remote.trash, (t) => t.courseId)
    }
  };
  const ids = new Set<string>([
    ...sides.local.courses.keys(),
    ...sides.local.trash.keys(),
    ...sides.remote.courses.keys(),
    ...sides.remote.trash.keys()
  ]);

  const stateOf = (side: Side, id: string): CourseState => {
    const s = sides[side];
    if (s.courses.has(id)) {
      // A course counts as in use from its last change, answer or study session.
      const at = latest(s.meta.get(id)?.updatedAt, s.meta.get(id)?.savedAt, s.progress.get(id)?.lastOpened, s.mastery.get(id)?.updatedAt);
      return { kind: 'active', at };
    }
    const trashed = s.trash.get(id);
    return trashed ? { kind: 'trash', at: trashed.deletedAt } : null;
  };

  const out = { courses: [] as Course[], progress: [] as CourseProgress[], courseMeta: [] as CourseMeta[], mastery: [] as CourseMastery[], trash: [] as TrashedCourse[] };

  for (const id of ids) {
    const l = stateOf('local', id);
    const r = stateOf('remote', id);
    const winner: Side = pickState(l, r);

    // Each side's copy of the course and its data, wherever it lives (library or trash).
    const part = (side: Side) => {
      const s = sides[side];
      const t = s.trash.get(id);
      return {
        course: s.courses.get(id) ?? t?.course,
        progress: s.progress.get(id) ?? t?.progress,
        mastery: s.mastery.get(id) ?? t?.mastery,
        meta: s.meta.get(id) ?? t?.meta
      };
    };
    const lp = part('local');
    const rp = part('remote');
    const course = pickCourse(lp.course, lp.meta, rp.course, rp.meta);
    if (!course) continue;
    const progress = mergeProgress(lp.progress, rp.progress);
    const mastery = mergeMastery(lp.mastery, rp.mastery);
    const meta = mergeMeta(lp.meta, rp.meta);

    const state = winner === 'local' ? l : r;
    if (state?.kind === 'active') {
      out.courses.push(course);
      if (progress) out.progress.push(progress);
      if (mastery) out.mastery.push(mastery);
      if (meta) out.courseMeta.push(meta);
    } else {
      const base = sides[winner].trash.get(id) as TrashedCourse;
      const item: TrashedCourse = { courseId: id, course, deletedAt: base.deletedAt };
      if (meta) item.meta = meta;
      if (progress) item.progress = progress;
      if (mastery) item.mastery = mastery;
      if (!isExpired(item, now)) out.trash.push(item);
    }
  }
  return out;
}

/** The later event wins: studying after a delete brings the course back, a later delete removes it. */
function pickState(l: CourseState, r: CourseState): Side {
  if (!r) return 'local';
  if (!l) return 'remote';
  if (l.at === r.at) return l.kind === 'active' || r.kind !== 'active' ? 'local' : 'remote';
  return l.at > r.at ? 'local' : 'remote';
}

/** The newer version of a course; for the same version, the copy saved last. */
function pickCourse(l: Course | undefined, lm: CourseMeta | undefined, r: Course | undefined, rm: CourseMeta | undefined): Course | undefined {
  if (!l) return r;
  if (!r) return l;
  const lv = l.version ?? 0;
  const rv = r.version ?? 0;
  if (lv !== rv) return lv > rv ? l : r;
  return (rm?.savedAt ?? '') > (lm?.savedAt ?? '') ? r : l;
}

function mergeMeta(l: CourseMeta | undefined, r: CourseMeta | undefined): CourseMeta | undefined {
  if (!l) return r;
  if (!r) return l;
  const base = (r.updatedAt ?? '') > (l.updatedAt ?? '') ? r : l;
  const savedAt = latest(l.savedAt, r.savedAt);
  return savedAt ? { ...base, savedAt } : base;
}

/** Progress: the newer answer per question, every completed lesson, the newer text per reflection. */
export function mergeProgress(l: CourseProgress | undefined, r: CourseProgress | undefined): CourseProgress | undefined {
  if (!l) return r;
  if (!r) return l;
  // The copy used last decides where things it cannot date are concerned (position, notes).
  const [primary, other] = r.lastOpened > l.lastOpened ? [r, l] : [l, r];
  const out: CourseProgress = {
    courseId: primary.courseId,
    courseVersion: Math.max(primary.courseVersion ?? 0, other.courseVersion ?? 0),
    completedLessons: union(primary.completedLessons, other.completedLessons),
    answers: mergeKeyed(primary.answers, other.answers, (a, b) => newerAnswer(a, b)),
    videoOverrides: { ...other.videoOverrides, ...primary.videoOverrides },
    lastOpened: primary.lastOpened
  };
  const position = primary.position ?? other.position;
  if (position) out.position = position;
  const maps = ['imageOverrides', 'notes', 'questionNotes'] as const;
  for (const key of maps) {
    if (primary[key] || other[key]) out[key] = { ...other[key], ...primary[key] };
  }
  if (primary.bookmarks || other.bookmarks) out.bookmarks = union(primary.bookmarks ?? [], other.bookmarks ?? []);
  if (primary.reflections || other.reflections) {
    out.reflections = mergeKeyed(primary.reflections ?? {}, other.reflections ?? {}, mergeReflection);
  }
  if (primary.reports || other.reports) {
    // A report the newer copy no longer has was cleared there, unless it was made after that.
    const reports = { ...primary.reports };
    for (const [id, report] of Object.entries(other.reports ?? {})) {
      if (!reports[id] && report.at > primary.lastOpened) reports[id] = report;
    }
    out.reports = reports;
  }
  return out;
}

function newerAnswer(a: AnswerRecord, b: AnswerRecord): AnswerRecord {
  return b.at > a.at ? b : a;
}

function mergeReflection(a: Reflection, b: Reflection): Reflection {
  const out: Reflection = { ...a };
  if ((b.dumpAt ?? '') > (a.dumpAt ?? '')) {
    out.dump = b.dump;
    out.dumpAt = b.dumpAt;
    if (b.covered) out.covered = b.covered;
    else delete out.covered;
    if (b.total !== undefined) out.total = b.total;
    else delete out.total;
  }
  if ((b.explainAt ?? '') > (a.explainAt ?? '')) {
    out.explain = b.explain;
    out.explainAt = b.explainAt;
  }
  return out;
}

/** Mastery: the newer record per skill and per review card, and both mistake logs. */
export function mergeMastery(l: CourseMastery | undefined, r: CourseMastery | undefined): CourseMastery | undefined {
  if (!l) return r;
  if (!r) return l;
  const [primary, other] = r.updatedAt > l.updatedAt ? [r, l] : [l, r];
  const out: CourseMastery = {
    courseId: primary.courseId,
    skills: mergeKeyed(primary.skills, other.skills, (a: SkillMastery, b: SkillMastery) => (b.updatedAt > a.updatedAt ? b : a)),
    mistakes: mergeMistakes(primary.mistakes, other.mistakes),
    updatedAt: primary.updatedAt
  };
  if (primary.reviews || other.reviews) out.reviews = { ...other.reviews, ...primary.reviews };
  if (primary.cards || other.cards) out.cards = mergeKeyed(primary.cards ?? {}, other.cards ?? {}, newerCard);
  return out;
}

function newerCard(a: ReviewCard, b: ReviewCard): ReviewCard {
  const at = a.lastReview ?? '';
  const bt = b.lastReview ?? '';
  if (bt !== at) return bt > at ? b : a;
  return b.reps > a.reps ? b : a;
}

function mergeMistakes(a: MistakeLogEntry[], b: MistakeLogEntry[]): MistakeLogEntry[] {
  const seen = new Map<string, MistakeLogEntry>();
  for (const entry of [...a, ...b]) {
    const key = `${entry.questionId}|${entry.at}|${entry.correct}`;
    if (!seen.has(key)) seen.set(key, entry);
  }
  return [...seen.values()].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0)).slice(-MASTERY.mistakeLogLimit);
}

/** The newer settings win, but each device keeps its own text size and backup reminders. */
function mergeSettingsRecord(l: Settings, r: Settings): Settings {
  if ((r.changedAt ?? '') <= (l.changedAt ?? '')) return l;
  const out = { ...r } as Record<string, unknown>;
  const own = l as unknown as Record<string, unknown>;
  for (const key of DEVICE_SETTINGS) {
    if (own[key] === undefined) delete out[key];
    else out[key] = own[key];
  }
  return out as unknown as Settings;
}

/** Per day, the larger count of each kind (the same day studied on both devices is not doubled). */
function mergeActivity(l: ActivityDay[], r: ActivityDay[]): ActivityDay[] {
  const days = byId(l, (d) => d.day);
  for (const day of r) {
    const mine = days.get(day.day);
    days.set(
      day.day,
      mine
        ? { day: day.day, correct: Math.max(mine.correct, day.correct), lessons: Math.max(mine.lessons, day.lessons), xp: Math.max(mine.xp, day.xp) }
        : day
    );
  }
  return [...days.values()];
}

function mergeGames(l: SavedGame[], r: SavedGame[], tombstones: Record<string, string>): SavedGame[] {
  const games = byId(l, (g) => g.id);
  for (const game of r) {
    const mine = games.get(game.id);
    if (!mine || gameScore(game) > gameScore(mine)) games.set(game.id, game);
  }
  return [...games.values()].filter((g) => !tombstones[`game:${g.id}`]);
}

/** A finished game beats an unfinished one, then the longer game, then the more reviewed one. */
function gameScore(g: SavedGame): number {
  const reviewed = (g.evals ?? []).filter((e) => e !== null && e !== undefined).length;
  return (g.result ? 1_000_000 : 0) + g.moves.length * 1000 + reviewed;
}

function mergeChess(l: ChessRecord, r: ChessRecord): ChessRecord {
  const endgames = { ...l.endgames };
  for (const [id, b] of Object.entries(r.endgames)) {
    const a = endgames[id];
    if (!a) {
      endgames[id] = b;
      continue;
    }
    const best = [a.bestMoves, b.bestMoves].filter((n): n is number => typeof n === 'number');
    const merged: ChessRecord['endgames'][string] = { done: a.done || b.done, at: latest(a.at, b.at) };
    if (best.length > 0) merged.bestMoves = Math.min(...best);
    endgames[id] = merged;
  }
  return { endgames };
}

function mergeDrills(l: Record<string, SyncDrillStat>, r: Record<string, SyncDrillStat>): Record<string, SyncDrillStat> {
  return mergeKeyed(l, r, (a, b) => {
    const out: SyncDrillStat = { solved: Math.max(a.solved, b.solved), best: Math.max(a.best, b.best) };
    const level = a.level ?? b.level;
    if (level) out.level = level;
    return out;
  });
}

function mergeMilestones(l: Record<string, string>, r: Record<string, string>): Record<string, string> {
  return mergeKeyed(l, r, (a, b) => (b < a ? b : a));
}

function mergeTombstones(l: Record<string, string>, r: Record<string, string>, now: Date): Record<string, string> {
  const cutoff = new Date(now.getTime() - TOMBSTONE_DAYS * 86_400_000).toISOString();
  const all = mergeKeyed(l, r, (a, b) => (b > a ? b : a));
  return Object.fromEntries(Object.entries(all).filter(([, at]) => at >= cutoff));
}

// ---------- helpers ----------

function mergeKeyed<T>(primary: Record<string, T>, other: Record<string, T>, pick: (a: T, b: T) => T): Record<string, T> {
  const out: Record<string, T> = { ...primary };
  for (const [key, value] of Object.entries(other ?? {})) {
    out[key] = key in out ? pick(out[key] as T, value) : value;
  }
  return out;
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

function latest(...values: (string | undefined)[]): string {
  return values.reduce<string>((best, v) => (v && v > best ? v : best), '');
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Lists sorted by their ids, so two copies with the same content compare equal. */
export function canonical(data: SyncData): SyncData {
  const by = <T>(key: (item: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  return {
    ...data,
    courses: [...data.courses].sort(by((c) => c.id)),
    progress: [...data.progress].sort(by((p) => p.courseId)),
    courseMeta: [...data.courseMeta].sort(by((m) => m.courseId)),
    mastery: [...data.mastery].sort(by((m) => m.courseId)),
    activity: [...data.activity].sort(by((d) => d.day)),
    trash: [...data.trash].sort(by((t) => t.courseId)),
    games: [...data.games].sort(by((g) => g.id))
  };
}

/** JSON with object keys sorted, for comparing two copies of the data. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (!isObject(v)) return v;
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
  });
}

/** True when the two copies hold the same data. */
export function sameData(a: SyncData, b: SyncData): boolean {
  return stableJson(canonical(a)) === stableJson(canonical(b));
}
