import { normalizeColorTheme } from './themes.ts';
import type { CourseOverrides, CourseSettingKey, Settings } from './types.ts';

export function defaultSettings(): Settings {
  return {
    theme: 'system',
    colorTheme: 'default',
    lastBackupAt: null,
    fontSize: 17,
    uiLanguage: 'en',
    explanationLevel: 'normal',
    explanationLanguage: 'en',
    questionLanguage: 'en',
    autoplayVideo: false,
    libraryShowProgress: true,
    libraryShowLastOpened: true,
    backupReminderDismissed: false,
    reduceMotion: false,
    gatingMode: 'locked',
    profileName: '',
    profileColor: '#356a8a',
    username: '',
    bio: '',
    dailyReviewLimit: 20,
    askConfidence: true,
    desiredRetention: 0.9,
    recallFirst: false,
    showWarmups: true,
    showReflect: true,
    allowHints: true,
    acceptTypos: true,
    interleavePractice: true,
    celebrations: true,
    sounds: false,
    glossaryTerms: true,
    dailyGoal: 50,
    readingFont: 'default',
    lineSpacing: 'normal',
    layout: 'standard',
    screenMode: 'auto',
    courseOverrides: {}
  };
}

/** Ready-made study styles: one click sets the learning options together. */
export type StudyStyle = 'balanced' | 'exam' | 'deep' | 'relaxed';

export const STUDY_STYLES: Record<StudyStyle, Partial<Settings>> = {
  // What the research supports for most learners.
  balanced: { desiredRetention: 0.9, dailyReviewLimit: 20, askConfidence: true, recallFirst: false, showWarmups: true, showReflect: true, allowHints: true, interleavePractice: true },
  // Remember as much as possible before an exam: more reviews, harder recall, no hints.
  exam: { desiredRetention: 0.95, dailyReviewLimit: 50, askConfidence: true, recallFirst: true, showWarmups: true, showReflect: true, allowHints: false, interleavePractice: true },
  // Understanding first: explain and brain-dump everything, mix topics.
  deep: { desiredRetention: 0.9, dailyReviewLimit: 30, askConfidence: true, recallFirst: true, showWarmups: true, showReflect: true, allowHints: true, interleavePractice: true },
  // Light and low-pressure: fewer reviews, fewer extra steps.
  relaxed: { desiredRetention: 0.85, dailyReviewLimit: 10, askConfidence: false, recallFirst: false, showWarmups: false, showReflect: false, allowHints: true, interleavePractice: false }
};

/** The study style the current settings match exactly, if any. */
export function currentStudyStyle(settings: Settings): StudyStyle | null {
  for (const [name, patch] of Object.entries(STUDY_STYLES) as [StudyStyle, Partial<Settings>][]) {
    if ((Object.keys(patch) as (keyof Settings)[]).every((key) => settings[key] === patch[key])) return name;
  }
  return null;
}

/** Old saved settings may lack newer keys; every key falls back to its default. */
export function mergeSettings(saved: unknown): Settings {
  const base = defaultSettings();
  if (typeof saved !== 'object' || saved === null) return base;
  const s = saved as Record<string, unknown>;
  const out: Settings = { ...base };
  if (s.theme === 'system' || s.theme === 'light' || s.theme === 'dark') out.theme = s.theme;
  const colorTheme = normalizeColorTheme(s.colorTheme);
  if (colorTheme) out.colorTheme = colorTheme;
  if (typeof s.lastBackupAt === 'string' && s.lastBackupAt.trim() !== '') out.lastBackupAt = s.lastBackupAt;
  if (typeof s.fontSize === 'number' && s.fontSize >= 12 && s.fontSize <= 28) out.fontSize = s.fontSize;
  if (s.uiLanguage === 'en' || s.uiLanguage === 'de') out.uiLanguage = s.uiLanguage;
  if (s.explanationLevel === 'normal' || s.explanationLevel === 'simple' || s.explanationLevel === 'detailed') {
    out.explanationLevel = s.explanationLevel;
  }
  if (s.explanationLanguage === 'en' || s.explanationLanguage === 'de') out.explanationLanguage = s.explanationLanguage;
  if (s.questionLanguage === 'en' || s.questionLanguage === 'de') out.questionLanguage = s.questionLanguage;
  if (typeof s.autoplayVideo === 'boolean') out.autoplayVideo = s.autoplayVideo;
  if (typeof s.libraryShowProgress === 'boolean') out.libraryShowProgress = s.libraryShowProgress;
  if (typeof s.libraryShowLastOpened === 'boolean') out.libraryShowLastOpened = s.libraryShowLastOpened;
  if (typeof s.backupReminderDismissed === 'boolean') out.backupReminderDismissed = s.backupReminderDismissed;
  if (typeof s.reduceMotion === 'boolean') out.reduceMotion = s.reduceMotion;
  if (s.gatingMode === 'locked' || s.gatingMode === 'free') out.gatingMode = s.gatingMode;
  if (typeof s.profileName === 'string') out.profileName = s.profileName.slice(0, 48);
  if (typeof s.profileColor === 'string' && /^#[\da-f]{6}$/i.test(s.profileColor)) out.profileColor = s.profileColor;
  if (typeof s.username === 'string') out.username = s.username.slice(0, 32);
  if (typeof s.bio === 'string') out.bio = s.bio.slice(0, 160);
  if (typeof s.dailyReviewLimit === 'number' && Number.isFinite(s.dailyReviewLimit)) {
    out.dailyReviewLimit = Math.min(100, Math.max(5, Math.round(s.dailyReviewLimit)));
  }
  if (typeof s.askConfidence === 'boolean') out.askConfidence = s.askConfidence;
  if (typeof s.desiredRetention === 'number' && Number.isFinite(s.desiredRetention)) {
    out.desiredRetention = Math.min(0.95, Math.max(0.8, Math.round(s.desiredRetention * 100) / 100));
  }
  for (const key of ['recallFirst', 'showWarmups', 'showReflect', 'allowHints', 'acceptTypos', 'interleavePractice', 'celebrations', 'sounds', 'glossaryTerms'] as const) {
    if (typeof s[key] === 'boolean') out[key] = s[key] as boolean;
  }
  if (typeof s.dailyGoal === 'number' && [0, 30, 50, 100, 200].includes(s.dailyGoal)) out.dailyGoal = s.dailyGoal;
  if (s.readingFont === 'default' || s.readingFont === 'hyperlegible') out.readingFont = s.readingFont;
  if (s.lineSpacing === 'normal' || s.lineSpacing === 'relaxed' || s.lineSpacing === 'loose') out.lineSpacing = s.lineSpacing;
  if (s.layout === 'standard' || s.layout === 'simple' || s.layout === 'detailed' || s.layout === 'compact') out.layout = s.layout;
  if (s.screenMode === 'auto' || s.screenMode === 'desktop') out.screenMode = s.screenMode;
  out.courseOverrides = normalizeOverridesMap(s.courseOverrides);
  return out;
}

/** The settings a course can set for itself: how it is explained, asked and scheduled. */
export const COURSE_SETTING_KEYS: readonly CourseSettingKey[] = [
  'explanationLevel',
  'explanationLanguage',
  'questionLanguage',
  'autoplayVideo',
  'gatingMode',
  'desiredRetention',
  'askConfidence',
  'recallFirst',
  'showWarmups',
  'showReflect',
  'allowHints',
  'acceptTypos',
  'interleavePractice',
  'celebrations',
  'sounds'
];

/** Keeps only known course keys with valid values; anything else is dropped. */
export function normalizeOverrides(raw: unknown): CourseOverrides {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const base = defaultSettings();
  const out: Record<string, unknown> = {};
  for (const key of COURSE_SETTING_KEYS) {
    if (!(key in source)) continue;
    // Run the value through the normal validation: an invalid value falls back to the default,
    // so it is kept only when it was accepted (possibly clamped) or really is the default.
    const checked = mergeSettings({ [key]: source[key] })[key];
    if (checked !== base[key] || source[key] === base[key]) out[key] = checked;
  }
  return out as CourseOverrides;
}

function normalizeOverridesMap(raw: unknown): Record<string, CourseOverrides> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, CourseOverrides> = {};
  for (const [courseId, value] of Object.entries(raw as Record<string, unknown>)) {
    const clean = normalizeOverrides(value);
    if (Object.keys(clean).length > 0) out[courseId] = clean;
  }
  return out;
}

/** The settings that apply inside one course: the app settings with the course's own on top. */
export function settingsFor(settings: Settings, courseId: string | null | undefined): Settings {
  const own = courseId ? settings.courseOverrides?.[courseId] : undefined;
  return own && Object.keys(own).length > 0 ? { ...settings, ...own } : settings;
}

/**
 * New overrides after a change. A set value is pinned for the course even when it matches the app
 * setting today; `null` removes the key so the course follows the app setting again.
 */
export function patchOverrides(
  current: CourseOverrides | undefined,
  patch: Partial<Record<CourseSettingKey, unknown>>
): CourseOverrides {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch) as [CourseSettingKey, unknown][]) {
    if (!COURSE_SETTING_KEYS.includes(key)) continue;
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  return normalizeOverrides(next);
}
