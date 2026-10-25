// All shared data shapes live here. Content (Course) is read-only; user data
// (progress, settings, library meta) is stored separately and refers to content by stable ids.

import type { ColorTheme } from './themes.ts';
import type { ActivityDay } from './activity.ts';

export const COURSE_SCHEMA_VERSION = 2;
export const USERDATA_SCHEMA_VERSION = 3;

// ---------- Course content (what a course file provides) ----------

export type QuestionKind =
  | 'multiple-choice'
  | 'true-false'
  | 'short-answer'
  | 'fill-blank'
  | 'numeric'
  | 'multi-select'
  | 'matching'
  | 'ordering'
  | 'chess'
  | 'written'
  | 'hotspot'
  | 'code'
  | 'sql'
  | 'trace'
  | 'shell';

/**
 * A test for a code question: call a function and compare the result ("call" with "expect"), or
 * run the whole program and compare what it prints ("output", with optional "stdin" lines).
 */
export type CodeTest = { call: string; expect: unknown } | { output: string; stdin?: string };

/** A tappable area on a hotspot question's picture, in percent of its width and height. */
export interface HotspotArea {
  x: number;
  y: number;
  w: number;
  h: number;
  /** What the area shows, used when the answer is revealed ("the resistor R2"). */
  label?: string;
}

/** A matching question's canonical pair: one prompt on the left and its one correct right. */
export interface QuestionPair {
  left: string;
  right: string;
}

/** Everything a question may use as its accepted answer, depending on `kind`. */
export type QuestionAnswer = number | boolean | string | string[] | number[];

/** Localized variants of one block's text, keyed by level (and media fields). */
export interface I18nText {
  normal?: string;
  simple?: string;
  detailed?: string;
  /** Callout/example bodies, and the image block's extra localized fields. */
  markdown?: string;
  alt?: string;
  caption?: string;
  /** Flashcard blocks: the cards in this language, same order as the top-level `cards`. */
  cards?: { front: string; back: string }[];
}

/** Localized question fields. Any missing field falls back to the top-level one. */
export interface QuestionI18n {
  prompt?: string;
  options?: string[];
  answer?: QuestionAnswer;
  explanation?: string;
  hint?: string;
  hints?: string[];
  /** Per-option "why that is not right" texts, parallel to `options`. */
  rationales?: string[];
  /** Localized matching pairs (same canonical order as the top-level `pairs`). */
  pairs?: QuestionPair[];
  /** Localized ordering items (same canonical order as the top-level `items`). */
  items?: string[];
  /** Localized key points of a written answer. */
  points?: string[];
  /** Localized column headings of a trace table. */
  columns?: string[];
  /** Localized picture (inline SVG) and its description, for a hotspot question. */
  svg?: string;
  alt?: string;
  /** Localized area labels, parallel to `areas`. */
  areaLabels?: string[];
}

export interface Question {
  id: string;
  kind: QuestionKind;
  prompt: string;
  options?: string[];
  /**
   * The accepted answer. Optional on purpose: `matching` and `ordering` carry their correct answer
   * in `pairs`/`items` instead. Every other kind is checked by the validator to have one.
   */
  answer?: QuestionAnswer;
  /** Allowed distance from `answer` for a `numeric` question; defaults to 0 (exact). */
  tolerance?: number;
  /** Correct left/right pairs for a `matching` question, in canonical order. */
  pairs?: QuestionPair[];
  /** Items for an `ordering` question, in CANONICAL (correct) order. */
  items?: string[];
  /** Per-option "why that is not right" texts, parallel to `options`. */
  rationales?: string[];
  explanation?: string;
  /** Optional nudge the learner can reveal before retrying. */
  hint?: string;
  /**
   * Progressive hints, revealed one per click. The last step is the full solution, so the
   * learner can always finish on their own. A single `hint` still works as the fallback.
   */
  hints?: string[];
  /**
   * Mastery skill this question counts toward. Defaults to the id of the lesson it lives in;
   * questions inside a module test or the final exam should name the lesson's skill explicitly.
   */
  skillId?: string;
  /**
   * Questions that test the same thing but with different wording. When one of a group is due for
   * review, the exercise engine asks a sibling from the same group instead of the exact question.
   */
  variantGroup?: string;
  /** Optional per-language overrides; the top-level fields stay as the fallback. */
  i18n?: Record<string, QuestionI18n>;
  /** Chess puzzle: the position (FEN). The side to move is the learner. */
  fen?: string;
  /** Chess puzzle: learner move, reply, learner move, ... (SAN or UCI), ending on a learner move. */
  solution?: string[];
  /** Chess puzzle: other complete lines that also count as solved. */
  alternatives?: string[][];
  /** Chess puzzle: the opponent's move that led to the position (UCI), highlighted on the board. */
  lastMove?: string;
  /** Chess puzzle: where it came from, for example "lichess.org/training/BAjmY". */
  source?: string;
  /** Written answer: the key points a good answer contains. `answer` holds a model answer. */
  points?: string[];
  /** Hotspot: the picture, as an image URL or inline SVG markup, and a description of it. */
  image?: string;
  svg?: string;
  alt?: string;
  /** Hotspot: the tappable areas; `answer` is the index of the right one. */
  areas?: HotspotArea[];
  /** Code: the language, the code the learner starts from and the tests; `answer` holds a model solution. */
  language?: string;
  starter?: string;
  tests?: CodeTest[];
  /** A SQL question: the script that builds the practice database, and whether row order counts. */
  setup?: string;
  ordered?: boolean;
  /** A trace table question: the column names, the complete correct rows, and which cells [row, column] the learner fills. */
  columns?: string[];
  rows?: string[][];
  blanks?: number[][];
  /** A shell question: the starting file tree (nested objects, text = file content), the folder to start in, and the goal. */
  fs?: Record<string, unknown>;
  cwd?: string;
  goal?: Record<string, unknown>;
}

/** Every block has an id and a type. Any other field is block-specific and optional for the core. */
export interface Block {
  id: string;
  type: string;
  /** Optional per-language text variants (used by text/callout blocks). */
  i18n?: Record<string, I18nText>;
  [key: string]: unknown;
}

export type ExplanationLevel = 'normal' | 'simple' | 'detailed';

export interface Lesson {
  id: string;
  title: string;
  goal?: string;
  blocks: Block[];
}

/** A technical term with a short definition, shown when the term is tapped in lesson text. */
export interface GlossaryEntry {
  term: string;
  definition: string;
  /** Other spellings or abbreviations that mean the same ("PK" for "primary key"). */
  aliases?: string[];
  /** The term in each language of the course. */
  i18n?: Record<string, { term?: string; definition?: string; aliases?: string[] }>;
}

export interface Module {
  id: string;
  title: string;
  summary?: string;
  lessons: Lesson[];
  /** Optional end-of-module test, a block of type "module-test". */
  test?: Block;
  /** The unit's key terms. */
  glossary?: GlossaryEntry[];
}

export interface Course {
  schemaVersion: number;
  id: string;
  title: string;
  subject?: string;
  level?: string;
  language?: string;
  /** Languages this course offers content for. */
  languages?: string[];
  /** Content version of this course. Bump it when you re-import an improved version. */
  version?: number;
  meta?: { createdBy?: string; createdAt?: string; tags?: string[] };
  modules: Module[];
  /** Optional final exam, a block of type "final-exam". */
  finalExam?: Block;
  /** Key terms of the whole course. */
  glossary?: GlossaryEntry[];
}

// ---------- User data (stored separately from content) ----------

export interface AnswerRecord {
  given: unknown;
  correct: boolean;
  at: string;
  attempts: number;
  /**
   * True when the question was solved correctly without a wrong attempt and without a hint.
   * Mastery is measured in first-try answers, so this flag always travels with the answer.
   */
  solvedOnFirstTry?: boolean;
}

// ---------- Mastery (the one currency per skill) ----------

/** Tiers in order; always derived from points via `tierForPoints`, never stored on their own. */
export type MasteryTier = 'not-started' | 'attempted' | 'familiar' | 'proficient' | 'mastered';

/** One skill's mastery, where a skill is the questions belonging to one lesson. */
export interface SkillMastery {
  skillId: string;
  /** 0-100 mastery points: the single currency. The tier is derived from this. */
  points: number;
  /** Per-question first-try flags (questionId -> solved without a wrong attempt or a hint). */
  firstTry: Record<string, boolean>;
  /** When this skill was last practised (ISO). Optional: records saved before v3 have none. */
  lastPracticedAt?: string;
  /** How many times a question of this skill has ever been answered wrongly. */
  timesMissed?: number;
  updatedAt: string;
}

/** Spaced re-review of one missed question: when it is next due, and how often it was missed. */
export interface QuestionReview {
  questionId: string;
  /** When this question should be asked again (ISO). */
  nextAt: string;
  /** Consecutive misses, which drives the interval (1 day, then 3, then 7). */
  misses: number;
}

/** How sure the learner said they were before checking an answer. */
export type Confidence = 'sure' | 'unsure' | 'guess';

/**
 * One question's spaced-repetition card (FSRS). Every answered question gets one; right answers
 * push it further out, wrong answers bring it back soon.
 */
export interface ReviewCard {
  questionId: string;
  /** The skill the question counts toward, so a skill's memory can be estimated from its cards. */
  skillId: string;
  /** When the question is due again (ISO). */
  due: string;
  /** Days until memory drops to 90%: the bigger, the better it is remembered. */
  stability: number;
  /** 1-10, how hard this question is for this learner. */
  difficulty: number;
  /** Days between the last review and the due date. */
  scheduledDays: number;
  /** Times answered. */
  reps: number;
  /** Times forgotten after having been learned. */
  lapses: number;
  /** Scheduler state: 0 new, 1 learning, 2 review, 3 relearning. */
  state: number;
  lastReview?: string;
  /** Grade of the day's first answer (1 again, 2 hard, 3 good, 4 easy). */
  lastRating?: number;
  /** True while the latest answer was wrong although the learner was sure. */
  confidentMiss?: boolean;
}

/** One graded attempt in the persistent mistake log. Entries with `correct: false` are mistakes. */
export interface MistakeLogEntry {
  questionId: string;
  skillId: string;
  moduleId: string | null;
  given: unknown;
  correct: boolean;
  at: string;
  /** How sure the learner said they were. Optional: older entries have none. */
  confidence?: Confidence;
}

/** All mastery a course holds. Stored in the `mastery` IndexedDB store, keyed by courseId. */
export interface CourseMastery {
  courseId: string;
  skills: Record<string, SkillMastery>;
  /** Every graded attempt, newest last; capped so one course cannot grow forever. */
  mistakes: MistakeLogEntry[];
  /** Spaced re-review schedule, keyed by question id. Optional: records saved before v3 have none. */
  reviews?: Record<string, QuestionReview>;
  /** Spaced-repetition cards for every answered question, keyed by question id. Optional: older records have none. */
  cards?: Record<string, ReviewCard>;
  updatedAt: string;
}

/** What a block hands back when one question is graded. */
export interface MasteryAttempt {
  questionId: string;
  correct: boolean;
  /** True when a hint (or the full solution) was revealed before answering. */
  usedHint: boolean;
  /** What the learner answered, kept in the mistake log. */
  given: unknown;
  /** How sure the learner said they were, when they said. */
  confidence?: Confidence;
  /** Counts as a test answer (can raise to Mastered or cost a tier) even outside a module test. */
  inTest?: boolean;
  /** The first answer to this question in this set (not a retry after a miss in the same set). */
  freshTry?: boolean;
}

export interface CourseProgress {
  courseId: string;
  courseVersion: number;
  position?: { lessonId: string };
  completedLessons: string[];
  answers: Record<string, AnswerRecord>;
  videoOverrides: Record<string, string>;
  /** Pasted image URLs keyed by block id. Optional: progress saved before image blocks have none. */
  imageOverrides?: Record<string, string>;
  /** Personal notes keyed by stable lesson id. */
  notes?: Record<string, string>;
  /** Private notes keyed by stable question id. */
  questionNotes?: Record<string, string>;
  /** Saved lesson, test, and exam item ids. */
  bookmarks?: string[];
  /** Brain dumps and "explain it simply" texts, keyed by lesson id or "unit:<moduleId>". */
  reflections?: Record<string, Reflection>;
  /** Questions the learner reported as faulty, keyed by question id. */
  reports?: Record<string, QuestionReport>;
  lastOpened: string;
}

/** A question the learner flagged as faulty, to be fixed later with a prompt. */
export interface QuestionReport {
  reason: 'wrong' | 'unclear' | 'typo' | 'other';
  note?: string;
  at: string;
}

/** What the learner wrote when reflecting on a lesson or unit. */
export interface Reflection {
  /** Brain dump: everything remembered, written from memory. */
  dump?: string;
  dumpAt?: string;
  /** Indexes of the key points the learner marked as covered by the dump. */
  covered?: number[];
  /** Key points in the lesson at the time of the dump, so the score stays meaningful. */
  total?: number;
  /** "Explain it simply" (Feynman) text. */
  explain?: string;
  explainAt?: string;
}

export interface CourseMeta {
  courseId: string;
  customTitle?: string;
  archived?: boolean;
  tags?: string[];
  /** The day of the exam for this course (YYYY-MM-DD), for the study planner. */
  examDate?: string;
  /** When these details last changed (ISO), so sync keeps the newer copy. */
  updatedAt?: string;
  /** When the course content was last added or replaced (ISO), so sync keeps the newer copy. */
  savedAt?: string;
}

/** How lessons, tests and modules unlock. */
export type GatingMode = 'locked' | 'free';

export interface Settings {
  /** When the settings last changed (ISO), so sync keeps the newer copy. */
  changedAt?: string;
  theme: 'system' | 'light' | 'dark';
  colorTheme: ColorTheme;
  /** ISO timestamp of the last exported backup, or null when none was ever made. */
  lastBackupAt: string | null;
  fontSize: number;
  uiLanguage: 'en' | 'de';
  explanationLevel: ExplanationLevel;
  /** Language for explanations (text / example / callout blocks). */
  explanationLanguage: 'en' | 'de';
  /** Language for question prompts, options and answers. */
  questionLanguage: 'en' | 'de';
  autoplayVideo: boolean;
  libraryShowProgress: boolean;
  libraryShowLastOpened: boolean;
  backupReminderDismissed: boolean;
  reduceMotion: boolean;
  /** 'locked' keeps the in-order gates; 'free' opens every lesson, test and module. */
  gatingMode: GatingMode;
  profileName: string;
  profileColor: string;
  /** Optional handle shown under the display name on Home. */
  username?: string;
  /** Optional one-line bio shown under the display name on Home. */
  bio?: string;
  /** Spaced reviews offered per day. */
  dailyReviewLimit: number;
  /** Show the "How sure are you?" buttons before checking an answer. */
  askConfidence: boolean;
  /** Share of questions the scheduler aims to keep remembered (0.8-0.95): higher means more reviews. */
  desiredRetention: number;
  /** Multiple choice: recall the answer in your head (or type it) before the options appear. */
  recallFirst: boolean;
  /** Show the guess-first warm-up questions at the start of lessons. */
  showWarmups: boolean;
  /** After a right answer to a concept question, ask "Why?" in the learner's own words first. */
  askWhy: boolean;
  /** Show the brain dump and "explain it simply" card at the end of lessons and units. */
  showReflect: boolean;
  /** Offer hints and the full solution in quizzes. */
  allowHints: boolean;
  /** Accept one small typo in typed answers (words of 5 letters or more). */
  acceptTypos: boolean;
  /** Mix a few questions from earlier lessons into practice sets. */
  interleavePractice: boolean;
  /** Celebrate meaningful moments: a new mastery level, the daily goal, a finished unit. */
  celebrations: boolean;
  /** Soft sounds for right and wrong answers. */
  sounds: boolean;
  /** Underline glossary terms in lesson text; tapping one shows its meaning. */
  glossaryTerms: boolean;
  /** Daily goal in energy points (XP); 0 turns it off. */
  dailyGoal: number;
  /** The if-then plan in the learner's words: "After breakfast". Empty when not set. */
  habitCue: string;
  /** The time of day for the calendar reminder, "HH:MM", or empty. */
  habitTime: string;
  /** Weekdays (0 = Sunday) that never break the streak. */
  restDays: number[];
  /** Reading font: the app font, or Atkinson Hyperlegible (designed for easy reading). */
  readingFont: 'default' | 'hyperlegible';
  /** Line spacing for lesson text. */
  lineSpacing: 'normal' | 'relaxed' | 'loose';
  /** How screens are laid out: how much is shown and how dense it is. */
  layout: LayoutMode;
  /** 'desktop' renders the wide layout on phones and tablets too (like "request desktop site"). */
  screenMode: 'auto' | 'desktop';
  /** Per-course learning settings that replace the app-wide ones for that course. */
  courseOverrides: Record<string, CourseOverrides>;
}

export type LayoutMode = 'standard' | 'simple' | 'detailed' | 'compact';

/** The settings a single course can change for itself. */
export type CourseSettingKey =
  | 'explanationLevel'
  | 'explanationLanguage'
  | 'questionLanguage'
  | 'autoplayVideo'
  | 'gatingMode'
  | 'desiredRetention'
  | 'askConfidence'
  | 'recallFirst'
  | 'showWarmups'
  | 'askWhy'
  | 'showReflect'
  | 'allowHints'
  | 'acceptTypos'
  | 'interleavePractice'
  | 'celebrations'
  | 'sounds';

export type CourseOverrides = Partial<Pick<Settings, CourseSettingKey>>;

/** A deleted course kept in the trash until it is restored or purged. */
export interface TrashedCourse {
  courseId: string;
  course: Course;
  meta?: CourseMeta;
  progress?: CourseProgress;
  mastery?: CourseMastery;
  deletedAt: string;
}

export interface Backup {
  /** Kept from before the rename to Courseify, so older backup files still restore. */
  kind: 'course-app-backup';
  schemaVersion: number;
  exportedAt: string;
  courses: Course[];
  progress: CourseProgress[];
  courseMeta: CourseMeta[];
  settings: Settings;
  /** Per-course mastery and mistake logs. Optional: backups from older apps have none. */
  mastery?: CourseMastery[];
  /** Day-by-day activity (streak / XP). Optional: backups from older apps have none. */
  activity?: ActivityDay[];
  /** Courses in the trash. Optional: backups from older apps have none. */
  trash?: TrashedCourse[];
  /** Chess games against the bots, with their reviews. Optional: older backups have none. */
  games?: SavedGame[];
  /** Chess records such as finished endgame drills. Optional: older backups have none. */
  chess?: ChessRecord;
}

// ---------- Chess games ----------

/** An engine's verdict on one position, always from White's point of view. */
export interface PositionEval {
  /** Centipawns, + is good for White. */
  cp?: number;
  /** Moves to mate: > 0 White mates, < 0 Black mates. */
  mate?: number;
  /** Set when the game is over in this position: the winner, or 'draw'. */
  over?: 'w' | 'b' | 'draw';
  /** Best move here (UCI) and the line that follows it. */
  best?: string;
  pv?: string[];
  /** The second-best move and its score, to spot moves that were the only good one. */
  second?: { move: string; cp?: number; mate?: number };
}

/** A game against a bot. `result` stays empty while the game is still being played. */
export interface SavedGame {
  id: string;
  botId: string;
  color: 'w' | 'b';
  startFen: string;
  /** Moves in UCI form ("e2e4", "e7e8q"). */
  moves: string[];
  result?: 'won' | 'lost' | 'draw';
  /** How it ended: mate, resign, stalemate, repetition, material, fifty. */
  reason?: string;
  startedAt: string;
  finishedAt?: string;
  /** Hints and take-backs are allowed in this game. */
  assist?: boolean;
  /** Hints or take-backs were used. */
  assisted?: boolean;
  /** Engine verdicts per position (index 0 = start), filled in by the game review. */
  evals?: (PositionEval | null)[];
  /** The clock: base minutes and increment in seconds. None means no clock. */
  time?: { base: number; inc: number };
  /** Time left on each clock (ms) when the game was last saved. */
  clock?: { w: number; b: number };
  /** Time left for the side that moved, after each move (ms). */
  times?: number[];
  /** Counts toward the rating against the bots (played without hints or take-backs). */
  rated?: boolean;
  /** How the rating changed when the game ended. */
  ratingChange?: number;
}

/** Chess progress outside games: endgame drills finished, with the fewest moves needed. */
export interface ChessRecord {
  endgames: Record<string, { done: boolean; bestMoves?: number; at: string }>;
  /** Rating against the bots, from rated games. */
  rating?: { value: number; games: number; peak: number };
}

// ---------- Block rendering contract ----------

/** What a block renderer may read and write. Renderers never touch storage directly. */
export interface BlockContext {
  courseId: string;
  /** The flat item being studied: a lesson id, "<moduleId>:test", or "final-exam". */
  lessonId: string;
  /** What kind of item that is. */
  itemKind: 'lesson' | 'test' | 'exam';
  /** Owning module id, or null in the final exam. */
  moduleId: string | null;
  explanationLevel: ExplanationLevel;
  explanationLanguage: 'en' | 'de';
  questionLanguage: 'en' | 'de';
  autoplayVideo: boolean;
  /** Show the "How sure are you?" buttons before checking. */
  askConfidence?: boolean;
  /** Multiple choice: think of the answer before the options appear. */
  recallFirst?: boolean;
  /** Offer hints and the full solution (default true). */
  allowHints?: boolean;
  /** Forgive one small typo in typed answers. */
  acceptTypos?: boolean;
  /** Show guess-first warm-up quizzes (default true). */
  showWarmups?: boolean;
  /** Ask "Why?" after a right answer to a concept question (default true). */
  askWhy?: boolean;
  /** Play soft sounds for right and wrong answers. */
  sounds?: boolean;
  /** Celebrate a new mastery level at the end of a set. */
  celebrations?: boolean;
  /** The course's display title, used in copied prompts. */
  courseTitle?: string;
  getAnswer(questionId: string): AnswerRecord | undefined;
  recordAnswer(questionId: string, record: AnswerRecord): void;
  getVideoOverride(blockId: string): string | undefined;
  setVideoOverride(blockId: string, url: string): void;
  /** A pasted image URL for a block, or undefined to use the course's own. */
  getImageOverride(blockId: string): string | undefined;
  setImageOverride(blockId: string, url: string): void;
  /** Mastery: which skill a question counts toward (the lesson id unless it names one). */
  skillIdFor(questionId: string): string;
  /** Flags a question as faulty (or clears the flag with null). */
  reportQuestion?(questionId: string, report: QuestionReport | null): void;
  /** Whether a question is flagged. */
  isReported?(questionId: string): boolean;
  /** Display name of a skill, for the results screen. */
  skillTitleFor(skillId: string): string;
  getSkillMastery(skillId: string): SkillMastery | undefined;
  /** A skill's points right now, after fading; falls back to the stored points when absent. */
  getSkillPoints?(skillId: string): number;
  /** Records one graded attempt against its skill and the persistent mistake log. */
  recordMasteryAttempt(attempt: MasteryAttempt): void;
  /** 0-100 mastery points over a whole module. */
  getModuleMasteryPercent(moduleId: string): number;
  /** Host action for "Continue" at the end of a quiz set. */
  onSetContinue?(): void;
  /** A practice set: every question starts unanswered, whatever was answered before. */
  freshRun?: boolean;
  /**
   * A timed mock exam ends at this moment (ms since 1970). In an exam, answers are saved without
   * showing right or wrong, there are no hints, and the results come at the end.
   */
  examDeadline?: number;
}

// ---------- Routing ----------

/** Pages of the Chess section: bots (default), a game, its review, games, endgames, free board. */
export type ChessView = 'bots' | 'game' | 'review' | 'games' | 'endgames' | 'endgame' | 'board';

export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'player'; courseId: string; lessonId?: string }
  | { name: 'unit'; courseId: string; moduleId: string }
  | { name: 'import' }
  | { name: 'prompt' }
  | { name: 'settings'; courseId?: string }
  | { name: 'play'; view?: ChessView; id?: string }
  | { name: 'drills'; id?: string }
  | { name: 'profile' }
  | { name: 'stats' }
  | { name: 'review' }
  | { name: 'trash' }
  | { name: 'exercise'; courseId: string; skillId: string }
  | { name: 'challenge'; courseId: string }
  | { name: 'exam'; courseId: string };
