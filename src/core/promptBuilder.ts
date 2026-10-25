// The course-prompt generator (M3). Turns the Create screen's settings into the prompts a chat assistant
// needs to write a course this app can import: an outline first, then one prompt per unit, then
// the final exam (or everything in one reply for small courses), plus a repair prompt.
//
// Pure functions only: no DOM, no storage. The wording encodes what the research found works for
// learning (retrieval practice, worked examples, misconceptions, interleaving) and for writing good
// questions (plausible distractors, no "all of the above", answers the app's exact-match grader can
// check).

import type { Course, QuestionKind } from './types.ts';
import { DRILLS } from './drills.ts';

// ---------- settings ----------

export type Preset = 'exam' | 'programming' | 'it' | 'maths' | 'understand' | 'chess' | 'refresher' | 'deep-dive' | 'custom';
export type Purpose = 'exam' | 'understand' | 'skill' | 'interest';
export type Level = 'beginner' | 'some' | 'intermediate' | 'advanced';
export type SourceMode = 'none' | 'pasted' | 'attached';
export type Strictness = 'only' | 'mainly';
export type LanguageMode = 'single' | 'bilingual';
export type TermsLanguage = 'primary' | 'both' | 'english';
export type Depth = 'short' | 'standard' | 'thorough';
export type Generation = 'stepwise' | 'single';
export type Difficulty = 'gentle' | 'moderate' | 'challenging' | 'mixed' | 'exam';
export type ChatTool = 'chatgpt' | 'claude' | 'gemini' | 'deepseek' | 'other';

export interface Extras {
  examples: boolean;
  analogies: boolean;
  mistakes: boolean;
  examTips: boolean;
  summaries: boolean;
  flashcards: boolean;
  images: boolean;
  videos: boolean;
  code: boolean;
  /** Two guess-first warm-up questions at the start of every lesson. */
  warmup: boolean;
  /** A "Read more" note with 1-2 real references at the end of every lesson. */
  reading: boolean;
  /** One quick check-in question in the middle of longer lessons. */
  checkins: boolean;
  /** A chess course: boards with worked examples, puzzles and positions to play out. */
  chess: boolean;
  /** Generated practice sets (drills) and graphs with sliders, for IT, maths and technical courses. */
  practice: boolean;
}

export interface PromptSettings {
  preset: Preset;
  topic: string;
  subject: string;
  level: Level;
  priorKnowledge: string;
  purpose: Purpose;
  examDetails: string;
  context: string;
  sourceMode: SourceMode;
  material: string;
  strictness: Strictness;
  citeSources: boolean;
  languageMode: LanguageMode;
  primaryLanguage: string;
  secondLanguage: string;
  termsLanguage: TermsLanguage;
  autoSize: boolean;
  modules: number;
  lessonsPerModule: number;
  depth: Depth;
  threeLevels: boolean;
  generation: Generation;
  questionsPerLesson: number;
  testQuestions: number;
  finalExam: boolean;
  finalExamQuestions: number;
  kinds: QuestionKind[];
  difficulty: Difficulty;
  progressiveHints: boolean;
  variants: boolean;
  examOperators: boolean;
  extras: Extras;
  tone: string;
  extraInstructions: string;
  tool: ChatTool;
}

export const ALL_KINDS: QuestionKind[] = [
  'multiple-choice',
  'true-false',
  'short-answer',
  'fill-blank',
  'numeric',
  'multi-select',
  'matching',
  'ordering',
  'written',
  'hotspot',
  'code'
];

/** Kinds every new course offers by default. Hotspot questions need drawn diagrams, so they are opt-in. */
export const DEFAULT_KINDS: QuestionKind[] = ALL_KINDS.filter((k) => k !== 'hotspot' && k !== 'code');

/** Languages offered for a single-language course. The in-lesson switch only covers de and en. */
export const LANGUAGES: Record<string, string> = {
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  tr: 'Turkish',
  pl: 'Polish',
  ru: 'Russian',
  uk: 'Ukrainian',
  ar: 'Arabic'
};

export const BILINGUAL_LANGUAGES = ['de', 'en'] as const;

export function languageName(code: string): string {
  return LANGUAGES[code] ?? code;
}

export function defaultSettings(): PromptSettings {
  return {
    preset: 'exam',
    topic: '',
    subject: '',
    level: 'beginner',
    priorKnowledge: '',
    purpose: 'exam',
    examDetails: '',
    context: '',
    sourceMode: 'pasted',
    material: '',
    strictness: 'mainly',
    citeSources: true,
    languageMode: 'bilingual',
    primaryLanguage: 'de',
    secondLanguage: 'en',
    termsLanguage: 'both',
    autoSize: true,
    modules: 4,
    lessonsPerModule: 4,
    depth: 'standard',
    threeLevels: true,
    generation: 'stepwise',
    questionsPerLesson: 5,
    testQuestions: 10,
    finalExam: true,
    finalExamQuestions: 20,
    kinds: [...DEFAULT_KINDS],
    difficulty: 'exam',
    progressiveHints: true,
    variants: true,
    examOperators: true,
    extras: {
      examples: true,
      analogies: true,
      mistakes: true,
      examTips: true,
      summaries: true,
      flashcards: true,
      images: true,
      videos: false,
      code: false,
      warmup: true,
      reading: true,
      checkins: true,
      chess: false,
      practice: false
    },
    tone: '',
    extraInstructions: '',
    tool: 'chatgpt'
  };
}

/** What each preset changes. Anything not listed keeps its current value. */
type PresetPatch = Partial<Omit<PromptSettings, 'extras'>> & { extras?: Partial<Extras> };

export const PRESETS: Record<Exclude<Preset, 'custom'>, PresetPatch> = {
  exam: {
    purpose: 'exam',
    sourceMode: 'pasted',
    strictness: 'mainly',
    citeSources: true,
    difficulty: 'exam',
    examOperators: true,
    finalExam: true,
    variants: true,
    extras: { examTips: true, mistakes: true, examples: true, code: false }
  },
  programming: {
    purpose: 'skill',
    sourceMode: 'none',
    difficulty: 'mixed',
    examOperators: false,
    depth: 'standard',
    kinds: ['code', 'multiple-choice', 'true-false', 'short-answer', 'fill-blank', 'numeric', 'multi-select', 'ordering'],
    extras: { code: true, examples: true, mistakes: true, examTips: false, images: false, videos: true }
  },
  it: {
    purpose: 'skill',
    sourceMode: 'none',
    difficulty: 'mixed',
    examOperators: false,
    kinds: ['numeric', 'multiple-choice', 'short-answer', 'fill-blank', 'multi-select', 'matching', 'ordering', 'true-false'],
    extras: { practice: true, examples: true, mistakes: true, flashcards: true, code: false, chess: false, images: true }
  },
  maths: {
    purpose: 'understand',
    sourceMode: 'none',
    difficulty: 'mixed',
    examOperators: false,
    threeLevels: true,
    kinds: ['numeric', 'multiple-choice', 'written', 'fill-blank', 'ordering', 'true-false'],
    extras: { practice: true, examples: true, mistakes: true, analogies: true, code: false, chess: false, flashcards: false }
  },
  chess: {
    purpose: 'skill',
    sourceMode: 'none',
    difficulty: 'mixed',
    examOperators: false,
    threeLevels: false,
    kinds: ['multiple-choice', 'true-false'],
    extras: { chess: true, code: false, images: false, videos: false, flashcards: false, examTips: false, examples: false, analogies: false }
  },
  understand: {
    purpose: 'understand',
    sourceMode: 'none',
    difficulty: 'moderate',
    examOperators: false,
    threeLevels: true,
    extras: { analogies: true, examples: true, mistakes: true, examTips: false, images: true }
  },
  refresher: {
    purpose: 'understand',
    autoSize: false,
    modules: 2,
    lessonsPerModule: 3,
    depth: 'short',
    threeLevels: false,
    generation: 'single',
    questionsPerLesson: 4,
    testQuestions: 6,
    finalExam: false,
    difficulty: 'mixed',
    extras: { flashcards: true, summaries: true, images: false, videos: false, examTips: false }
  },
  'deep-dive': {
    purpose: 'understand',
    autoSize: false,
    modules: 7,
    lessonsPerModule: 5,
    depth: 'thorough',
    threeLevels: true,
    generation: 'stepwise',
    questionsPerLesson: 6,
    testQuestions: 12,
    finalExam: true,
    finalExamQuestions: 25,
    difficulty: 'mixed',
    extras: { examples: true, analogies: true, mistakes: true, summaries: true, flashcards: true }
  }
};

/** Settings with a preset applied on top. 'custom' leaves everything as it is. */
export function applyPreset(settings: PromptSettings, preset: Preset): PromptSettings {
  if (preset === 'custom') return { ...settings, preset };
  const { extras, ...rest } = PRESETS[preset];
  return { ...settings, ...rest, preset, extras: { ...settings.extras, ...(extras ?? {}) } };
}

/** Restores saved settings: unknown or wrong-typed fields fall back to the defaults. */
export function normalizeSettings(raw: unknown): PromptSettings {
  const base = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base) as (keyof PromptSettings)[]) {
    const value = r[key];
    const fallback = base[key];
    if (key === 'extras') {
      const extras = { ...base.extras };
      if (typeof value === 'object' && value !== null) {
        for (const k of Object.keys(extras) as (keyof Extras)[]) {
          const v = (value as Record<string, unknown>)[k];
          if (typeof v === 'boolean') extras[k] = v;
        }
      }
      out.extras = extras;
    } else if (key === 'kinds') {
      const kinds = Array.isArray(value) ? value.filter((k): k is QuestionKind => ALL_KINDS.includes(k as QuestionKind)) : [];
      out.kinds = kinds.length > 0 ? kinds : base.kinds;
    } else if (typeof value === typeof fallback) {
      out[key] = value;
    }
  }
  return out as unknown as PromptSettings;
}

// ---------- ids ----------

const TRANSLIT: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };

/** A stable course id from the topic: "Netzwerke & Subnetting" -> "netzwerke-subnetting". */
export function courseIdFor(topic: string): string {
  const slug = topic
    .replace(/[äöüßÄÖÜ]/g, (c) => TRANSLIT[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug || 'course';
}

// ---------- shared prompt sections ----------

const LEVEL_TEXT: Record<Level, string> = {
  beginner: 'a complete beginner',
  some: 'someone who knows the basics but has gaps',
  intermediate: 'an intermediate learner who wants to get solid',
  advanced: 'an advanced learner who wants depth and edge cases'
};

const PURPOSE_TEXT: Record<Purpose, string> = {
  exam: 'pass an upcoming exam',
  understand: 'really understand the topic, not just memorise it',
  skill: 'be able to use this as a practical skill',
  interest: 'learn it out of interest'
};

const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  gentle: 'gentle: mostly recall and understanding, small steps, lots of encouragement',
  moderate: 'moderate: a balanced mix of recall, understanding and application',
  challenging: 'challenging: mostly application and analysis, multi-step problems',
  mixed: 'mixed: an even spread from easy to hard inside every quiz',
  exam: 'exam level: like the real exam, with the same task types and difficulty, getting harder towards the end of each unit'
};

const DEPTH_TEXT: Record<Depth, string> = {
  short: 'short: about 150-250 words of explanation per lesson',
  standard: 'standard: about 300-500 words of explanation per lesson',
  thorough: 'thorough: about 600-900 words of explanation per lesson, with edge cases'
};

const KIND_TEXT: Record<QuestionKind, string> = {
  'multiple-choice': 'multiple-choice (4 options, exactly one correct)',
  'true-false': 'true-false (a claim that is clearly right or clearly wrong)',
  'short-answer': 'short-answer (a term or very short phrase)',
  'fill-blank': 'fill-blank (one key word missing from a sentence)',
  numeric: 'numeric (a calculated number, with "tolerance" when rounding is fair)',
  'multi-select': 'multi-select (several correct options)',
  matching: 'matching (2-6 pairs, e.g. term to meaning)',
  ordering: 'ordering (2-6 steps in the correct order)',
  chess: 'chess (a puzzle on a board: a legal FEN with the learner to move and the solution line in SAN, 1-3 learner moves)',
  written: 'written (an exam-style task answered in 2-5 sentences, with a model answer and 2-6 key points; use it for "explain", "describe" and "compare" tasks, at most one per lesson quiz)',
  hotspot: 'hotspot (the learner taps the right part of a simple SVG diagram you draw: a circuit, a table, a network or a labelled sketch)',
  code: 'code (a small programming task: the learner writes code in the app and it is checked by tests you write; see the CODE part of the schema)',
  shell: 'shell (a command-line task in a small fake file tree: hand-written courses only)',
  trace: 'trace (a trace table of a program: hand-written courses only)',
  sql: 'sql (a query task: the learner writes SQL against a small practice database; not offered by the builder, hand-written courses only)'
};

/** Chess courses get the chess part of the schema too; every other course keeps it short. */
const CHESS_SCHEMA = [
  'CHESS (chess courses only)',
  'Worked example: { "id": "m1-l1-b2", "type": "chess", "mode": "show", "title": "...", "fen": "<legal FEN>", "caption": "what to look at first", "steps": [ { "move": "Nc7+", "note": "one sentence", "arrows": ["c7e8", "c7a8"], "highlights": ["c7"] } ] }',
  'Play it out: { "id": "m1-l1-b3", "type": "chess", "mode": "play", "title": "...", "fen": "<legal FEN>", "goal": "mate" | "promote" | "hold" | "free", "prompt": "what to do", "level": 1-5, "maxMoves": 20 }',
  'Puzzle question: { "id": "q-m1-l1-1", "kind": "chess", "prompt": "**White to move.** Win material with a fork.", "fen": "<legal FEN, the learner is the side to move>", "solution": ["Nc7+", "Kd7", "Nxa8"], "explanation": "...", "hint": "a nudge" }',
  '  "solution" alternates a move by the learner and the reply, and ENDS with a move by the learner (odd length). Use SAN. Any checkmating move is always accepted. Optional "alternatives": [[...other full lines...]] and "lastMove": "e7e5" (the move by the opponent that led to the position, UCI).',
  '  Only positions that can happen in a real game: one king per side, the side NOT to move is not in check, no pawns on the first or last rank.'
].join('\n');

/** Programming courses get the code part of the schema: runnable examples and checked exercises. */
const CODE_SCHEMA = [
  'CODE (programming courses only; "language" is "python" or "javascript")',
  'Runnable example block: { "id": "m1-l1-b3", "type": "code", "language": "python", "title": "...", "code": "name = \\"Ada\\"\\nprint(\\"Hello\\", name)", "caption": "what to notice" }',
  'Code question: { "id": "q-m1-l1-1", "kind": "code", "language": "python", "prompt": "Write a function `add(a, b)` that returns the sum.", "starter": "def add(a, b):\\n    pass\\n", "answer": "def add(a, b):\\n    return a + b\\n", "tests": [ { "call": "add(2, 3)", "expect": 5 }, { "call": "add(-1, 1)", "expect": 0 } ], "hints": ["...", "..."], "explanation": "..." }',
  '  A test either calls a function and compares the result as JSON ("call" + "expect"), or runs the whole program and compares what it prints ("output", with optional "stdin": input lines separated by \\n). Write 2-5 tests including an edge case. Make sure your "answer" passes every test.',
  '  No imports beyond the standard library, no files, no network. Keep tasks small: 3-15 lines of code.'
].join('\n');

/** Courses with practice get the drill and graph blocks: the drills the app can generate, and graphs. */
const PRACTICE_SCHEMA = [
  'PRACTICE BLOCKS (the app generates the problems itself, with worked solutions)',
  'Drill block: { "id": "m1-l1-b5", "type": "drill", "drill": "<one id below>", "level": 1 | 2 | 3, "count": 5 }',
  `  Drill ids: ${DRILLS.map((d) => d.id).join(', ')}.`,
  '  bin-dec, dec-bin, hex-dec, dec-hex, bin-hex: number systems. units: KB/KiB/MB/Mbit conversions. transfer: download times. cidr: prefix and subnet mask. subnet-hosts, subnet-network, subnet-broadcast: subnetting. linear: linear equations. percent: percentages. fractions: fraction arithmetic. scientific: powers of ten. ohm: Ohm\'s law. quadratic: quadratic equations (p-q formula). line: slope and y-intercept.',
  'Graph block: { "id": "m1-l1-b6", "type": "graph", "title": "...", "functions": [ { "expr": "a*x^2 + b", "label": "f" } ], "params": [ { "name": "a", "min": -3, "max": 3, "step": 0.5, "value": 1, "label": "a" } ], "x": [-6, 6], "y": [-4, 8], "points": [[0, 0]], "caption": "what to try with the sliders" }',
  '  "expr" uses x, the parameter letters, + - * / ^, brackets and sin cos tan sqrt abs ln log exp, pi, e. 1-4 functions, at most 4 sliders (one letter each, not x).'
].join('\n');

function schemaFor(s: PromptSettings, schema: string): string {
  let out = schema.trim();
  if (s.extras.chess) out += `\n\n${CHESS_SCHEMA}`;
  if (s.extras.code || s.kinds.includes('code')) out += `\n\n${CODE_SCHEMA}`;
  if (s.extras.practice) out += `\n\n${PRACTICE_SCHEMA}`;
  return out;
}

function list(lines: string[]): string {
  return lines.filter((line) => line.trim() !== '').map((line) => `- ${line}`).join('\n');
}

function section(title: string, body: string): string {
  return body.trim() === '' ? '' : `## ${title}\n\n${body.trim()}\n`;
}

/** Paragraphs and sections, separated by one blank line; empty parts are dropped. */
function join(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .join('\n\n');
}

function topicOf(s: PromptSettings): string {
  return s.topic.trim() || '(not given: choose the topic from my material)';
}

function role(s: PromptSettings): string {
  const subject = s.subject.trim() ? ` for ${s.subject.trim()}` : '';
  const exam = s.purpose === 'exam' ? ' and an experienced exam writer' : '';
  return `You are an expert teacher, instructional designer${exam}${subject}. You write courses that make people actually learn: clear explanations, worked examples, and lots of well-designed practice questions. You are precise and never invent facts.`;
}

function learner(s: PromptSettings): string {
  const lines = [
    `Topic: ${topicOf(s)}`,
    s.subject.trim() ? `Subject: ${s.subject.trim()}` : '',
    `Learner: ${LEVEL_TEXT[s.level]}.`,
    s.priorKnowledge.trim() ? `What they already know: ${s.priorKnowledge.trim()}` : '',
    `Goal: ${PURPOSE_TEXT[s.purpose]}.`,
    s.context.trim() ? `Context: ${s.context.trim()}` : '',
    s.purpose === 'exam' && s.examDetails.trim() ? `The exam: ${s.examDetails.trim()}` : '',
    s.tone.trim() ? `Tone: ${s.tone.trim()}` : 'Tone: clear, direct and friendly. No filler, no hype.'
  ];
  return section('Who this is for', list(lines));
}

function material(s: PromptSettings, step: 'outline' | 'later'): string {
  if (s.sourceMode === 'none') {
    return section(
      'Sources',
      list([
        'Use well-established knowledge only. If you are not sure something is correct, leave it out.',
        'Prefer the standard terms and definitions used in textbooks and exams for this topic.'
      ])
    );
  }
  const strict =
    s.strictness === 'only'
      ? 'Use ONLY my material. Do not add facts that are not in it. If something important is missing, mention it in the unit summary instead of inventing it.'
      : 'My material comes first: cover everything in it, use its terms, definitions and notation exactly. You may add well-established background knowledge to fill gaps; mark every addition with "(extra)" at the end of the sentence.';
  const where =
    s.sourceMode === 'attached'
      ? step === 'outline'
        ? 'My class material is attached to this message (files or images). Read all of it before you plan.'
        : 'Use the class material I attached earlier in this chat. If you cannot see it any more, tell me and stop.'
      : step === 'outline' || s.material.trim().length < 6000
        ? `My class material is between the <material> tags.\n\n<material>\n${s.material.trim() || '(I will paste it in my next message.)'}\n</material>`
        : 'Use the class material I pasted earlier in this chat.';
  const lines = [
    strict,
    'Never contradict my material. If it disagrees with what you know, follow my material and add a short note.',
    s.citeSources
      ? 'Every question\'s "explanation" ends with where it comes from in my material, e.g. "(Source: handout 2, page 3)" or "(Source: notes, section Subnetting)".'
      : '',
    'Before you write a question, find the sentence in my material that supports its correct answer. Drop questions you cannot support.'
  ];
  return section('My material', `${where}\n\n${list(lines)}`);
}

function languageRules(s: PromptSettings): string {
  if (s.languageMode === 'single') {
    const lang = languageName(s.primaryLanguage);
    const terms =
      s.termsLanguage === 'english' && s.primaryLanguage !== 'en'
        ? 'Keep established English technical terms in English, explained in the text.'
        : s.termsLanguage === 'both' && s.primaryLanguage !== 'en'
          ? 'When you introduce a technical term, give the English term in brackets the first time.'
          : '';
    return section(
      'Language',
      list([
        `Write everything in ${lang} ("${s.primaryLanguage}"). Set "language": "${s.primaryLanguage}" and "languages": ["${s.primaryLanguage}"].`,
        'Use the plain top-level fields (prompt, options, markdown, levels, ...). Do not add "i18n" objects.',
        terms
      ])
    );
  }
  const a = s.primaryLanguage;
  const b = s.secondLanguage;
  const terms =
    s.termsLanguage === 'primary'
      ? `In the ${languageName(b)} version, keep the ${languageName(a)} technical terms in brackets so the learner recognises them in the exam.`
      : s.termsLanguage === 'both'
        ? 'In both versions, give the technical term in the other language in brackets the first time it appears.'
        : 'Keep established English technical terms in English in both versions.';
  return section(
    'Languages (important)',
    list([
      `Write every piece of content in BOTH ${languageName(a)} ("${a}") and ${languageName(b)} ("${b}"). The learner switches between them with a button inside each lesson.`,
      `Set "language": "${a}" and "languages": ["${a}", "${b}"].`,
      `Every human-readable text goes into "i18n": { "${a}": { ... }, "${b}": { ... } } with the same meaning in both. The top-level fields (prompt, options, markdown, levels, explanation, hint, ...) hold a copy of the ${languageName(a)} text as the fallback.`,
      'Answers stay identical across languages where possible (indexes, numbers, true/false). For short-answer and fill-blank, put the accepted answers of each language in that language\'s "i18n" entry as "answer".',
      terms,
      'Both versions are complete and natural - not word-for-word machine translation.'
    ])
  );
}

function lessonRecipe(s: PromptSettings): string {
  const e = s.extras;
  const levels = s.threeLevels
    ? 'one "text" block with the explanation in three depths: "normal" (the standard explanation), "simple" (for someone who is lost: everyday words and a comparison) and "detailed" (precise terms, edge cases, why it works)'
    : 'one "text" block with the explanation ("normal" only)';
  const steps = [
    e.warmup
      ? 'Begin with a "quiz" block with "pretest": true holding 2 quick questions about what the lesson is going to teach. The learner guesses BEFORE reading (guessing first, even wrongly, makes the lesson stick better); these do not count for mastery. Ask about the core idea, make them answerable by a smart guess, and give each a short explanation.'
      : '',
    `${e.warmup ? 'Then' : 'Start with'} ${levels}. Length: ${DEPTH_TEXT[s.depth]}. Begin with one sentence on why this matters, then explain step by step, and use small tables or numbered lists where they make things clearer.`,
    e.analogies ? 'Use a concrete everyday comparison or example for every abstract idea.' : '',
    e.chess
      ? 'This is a chess course: teach on the board. For every idea add a "chess" block with "mode": "show" (a worked example you step through: "fen" plus "steps", each with a "move" in SAN, a one-sentence "note", and optional "arrows" such as "e2e4" and "highlights" such as "f7"). In endgame lessons add a "chess" block with "mode": "play" so the learner plays the position out against the computer. Most quiz questions are "chess" puzzles (see the CHESS part of the schema). Use small, clear positions with few pieces, and check every position and every move yourself: an illegal FEN or move is rejected by the app.'
      : '',
    e.code
      ? 'This course teaches programming. Show examples as runnable "code" blocks (see the CODE part of the schema) so the learner can run and change them in the app; use fenced Markdown code blocks (```sql, ```bash, ...) only for languages the app cannot run. Keep examples short and commented. Most quiz questions of a lesson are "code" tasks checked by tests, plus a few questions about reading code (what does it print? where is the bug?).'
      : '',
    e.practice
      ? 'Where a lesson teaches a skill one of the app\'s drills covers (number systems, units, subnetting, equations, percent, fractions, Ohm\'s law, ...), add a "drill" block right after the worked example (see PRACTICE BLOCKS): "level" 1 in the first lesson on it, 2-3 later, "count" 4-6. Where a function or a relationship between two quantities is taught, add a "graph" block with sliders for its parameters and a caption that says what to try ("make a negative and watch ..."). Use them where they fit, not in every lesson.'
      : '',
    e.examples
      ? 'Add one "example" block: a fully worked example with numbered steps and the reasoning for each step, not just the result. Then hand the work over step by step: the first quiz questions of the lesson give a similar problem with the first steps already done, so the learner only finishes it, and later questions ask for the whole solution.'
      : '',
    'Write every formula in LaTeX between dollar signs ($R = \\frac{U}{I}$ inline; in the JSON every backslash is written twice, $$...$$ for a display formula on its own line); the app draws them. Where a diagram makes an idea clearer (a process, a data model, a sequence of messages), draw it as a ```mermaid code block inside the text (flowchart, erDiagram, sequenceDiagram or timeline) instead of describing it in words or ASCII art.',
    '"callout" block with style "keypoint": the 2-4 things to remember from this lesson, each as its own "- " bullet in one short sentence. The app turns these bullets into the checklist for the learner\'s brain dump, so each bullet must be a complete, checkable idea.',
    e.checkins
      ? 'In lessons longer than a few paragraphs, split the explanation into two "text" blocks and put a "quiz" block with ONE quick check-in question between them, so the learner recalls the first half before reading on.'
      : '',
    e.mistakes ? '"callout" block with style "warning": the most common mistake or misconception, why people make it, and how to avoid it.' : '',
    e.examTips ? '"callout" block with style "tip": how this shows up in exams and what examiners look for.' : '',
    e.images ? '"image" block where a diagram genuinely helps, with "url": null and a precise "searchTerm" (never invent an image URL).' : '',
    e.videos
      ? '"video" block where a short ENGLISH YouTube video genuinely helps (at most one per lesson): "url" is the full link of a real video you are certain exists, "title" is its exact title. Prefer well-known educational channels (CrashCourse, freeCodeCamp, 3Blue1Brown, Computerphile, Professor Messer, PowerCert). If you are not completely sure a video exists, leave the video block out - never invent or guess a link.'
      : 'No "video" blocks.',
    e.flashcards ? '"flashcards" block with 3-6 cards for the key terms and facts (not copies of quiz questions).' : '',
    e.summaries ? '"callout" block with style "note": a 2-4 line summary of the lesson.' : '',
    e.reading
      ? '"callout" block with style "note" whose markdown starts with "**Read more**": 1-2 real references for this lesson (a textbook chapter, official documentation or a Wikipedia article) so the learner can double-check. Only list sources you are certain exist; give the exact title and, for websites, the full link.'
      : '',
    `Finish with one "quiz" block of ${s.questionsPerLesson} questions.`
  ];
  return section('Every lesson, in this order', list(steps));
}

function questionRules(s: PromptSettings): string {
  const chosen = s.kinds.length > 0 ? s.kinds : ALL_KINDS;
  // Chess puzzles are offered only to chess courses, never by default.
  const kinds: QuestionKind[] = s.extras.chess ? ['chess', ...chosen.filter((k) => k !== 'chess')] : chosen;
  const lines = [
    `Allowed question kinds: ${kinds.map((k) => KIND_TEXT[k]).join('; ')}. Pick the kind that fits the content, vary them, and use each allowed kind at least once per unit.`,
    `Difficulty: ${DIFFICULTY_TEXT[s.difficulty]}.`,
    'Every lesson quiz mixes levels: about 40% recall and understanding, 40% applying it to a new case, 20% analysing or comparing. Every question checks the lesson goal, not trivia.',
    'Write each question in this order in your head: first solve it yourself and write the correct answer, then list 2-3 mistakes a real learner would make on it, then turn exactly those mistakes into the wrong options. Wrong options are believable: build them from real misconceptions and typical calculation slips. Keep options similar in length and style. Exactly one correct option (multiple-choice). Put the correct option in a different position each time.',
    'Do not only ask for facts. In every unit also use: "find the mistake" (show a short worked solution with one wrong step and ask which step is wrong), "why" questions (which reason explains this?), putting solution steps in order (ordering), and real-life scenarios where the learner applies the idea.',
    'Never use "all of the above", "none of the above", trick wording or double negatives. Ask positively.',
    'Every question has an "explanation" that teaches (why the answer is right, and why the tempting wrong answer is wrong) and a "hint" that nudges without giving the answer away.',
    s.progressiveHints
      ? 'Also give "hints": 2-3 hints that get more specific step by step (the last one almost solves it, but still is not the answer).'
      : '',
    'Option-based kinds (multiple-choice, multi-select) ALWAYS have "rationales": one short line for EVERY option saying why it is right or wrong. The app shows the rationale of the option the learner picked, so it must explain that specific mistake.',
    'GRADING: short-answer and fill-blank answers are checked by exact match after lowercasing, trimming and removing final punctuation. So ask for ONE word, number or very short term, and list every accepted spelling, synonym, abbreviation and plural in "answer" (e.g. ["DNS", "Domain Name System"]). Never expect a full sentence.',
    'numeric: the unit goes in the prompt ("in bits"), the "answer" is just the number. Add "tolerance" when rounding is fair.',
    s.variants
      ? 'For every core idea of a lesson, write 2-3 variants of the same question (same idea, different numbers, wording or question kind) and give them the same "variantGroup" (e.g. "m1-l2-subnet-mask"). The app asks a different variant when it brings a question back for review, so the learner remembers the idea and not the wording.'
      : '',
    s.examOperators && s.purpose === 'exam'
      ? 'Use the task verbs of German exams ("Operatoren") in the question wording where they fit: nennen, beschreiben, erklären, erläutern, berechnen, vergleichen, beurteilen. Spread the three requirement levels (Anforderungsbereiche I reproduce, II apply, III evaluate) across every unit.'
      : ''
  ];
  return section('Questions', list(lines));
}

function idRules(courseId: string): string {
  return section(
    'Ids',
    list([
      `The course id is "${courseId}" - use exactly this.`,
      'Units are "m1", "m2", ...; lessons "m1-l1", "m1-l2", ...; blocks "m1-l1-b1", ...; questions "q-m1-l1-1", ...; unit tests "m1-test" with questions "q-m1-t-1", ...; the final exam "final-exam" with questions "q-final-1", ...',
      'Every id is unique across the whole course. Ids only use letters, digits, "-", "_" and ".".'
    ])
  );
}

function outputRules(wrapper: string): string {
  return section(
    'Output',
    list([
      'Reply with ONE ```json code block and nothing else: no introduction, no comments inside the JSON, no text after it.',
      'The JSON must be valid: double quotes, no trailing commas, no comments, no "..." placeholders. Escape quotes and backslashes inside strings; write line breaks in Markdown text as \\n.',
      `Shape: ${wrapper}`
    ])
  );
}

function selfCheck(extra: string[] = []): string {
  return section(
    'Before you answer, check silently',
    list([
      'Every lesson follows the order above and nothing is left empty or marked TODO.',
      'Every correct answer is actually correct, and every question can be answered from what the lessons teach.',
      'short-answer / fill-blank answers are short and list all accepted variants.',
      'No id is used twice.',
      ...extra,
      'The JSON parses.'
    ])
  );
}

function extraInstructions(s: PromptSettings): string {
  return s.extraInstructions.trim() ? section('My extra instructions (follow them)', s.extraInstructions.trim()) : '';
}

// ---------- the prompts ----------

function sizeText(s: PromptSettings): string {
  return s.autoSize
    ? 'Choose the number of units yourself (usually 3-8) so the course covers the topic well; 3-5 lessons per unit. Each lesson teaches ONE idea.'
    : `Exactly ${s.modules} units with about ${s.lessonsPerModule} lessons each. Each lesson teaches ONE idea.`;
}

/** Step 1 of the step-by-step flow: plan the course. No lesson content yet. */
export function outlinePrompt(s: PromptSettings): string {
  const courseId = courseIdFor(s.topic);
  const languages = s.languageMode === 'bilingual' ? `["${s.primaryLanguage}", "${s.secondLanguage}"]` : `["${s.primaryLanguage}"]`;
  return join([
    role(s),
    '# Step 1: plan the course',
    'We will build a course together in several steps. In THIS step you only write the plan (the outline). I import it into my learning app, then ask you for each unit\'s full content in later messages. Do not write lesson content yet.',
    learner(s),
    material(s, 'outline'),
    section(
      'How to plan',
      list([
        sizeText(s),
        'Order everything so each lesson only needs earlier lessons. Start with the foundations.',
        'Each lesson "goal" is one sentence with an observable verb: what the learner can DO afterwards ("calculate the network address of a subnet", not "understand subnets").',
        'Each unit "summary" says in 1-2 sentences what the unit covers and why it matters.',
        s.sourceMode !== 'none' ? 'Every topic in my material appears in some lesson. Nothing important is skipped.' : '',
        'Titles are short and specific (2-6 words).'
      ])
    ),
    s.languageMode === 'bilingual'
      ? section('Languages', list([`Write titles, summaries and goals in ${languageName(s.primaryLanguage)}; the full content comes later in both languages.`]))
      : section('Language', list([`Write in ${languageName(s.primaryLanguage)}.`])),
    idRules(courseId),
    extraInstructions(s),
    outputRules(
      `{"schemaVersion": 2, "id": "${courseId}", "title": "...", "subject": "${s.subject.trim() || '...'}", "level": "...", "language": "${s.primaryLanguage}", "languages": ${languages}, "modules": [{"id": "m1", "title": "...", "summary": "...", "lessons": [{"id": "m1-l1", "title": "...", "goal": "...", "blocks": []}]}]}. Lessons have "blocks": [] for now. No tests and no final exam yet.`
    ),
    selfCheck(['The outline covers the whole topic in a sensible order.'])
  ]);
}

/** Step 2 (repeated): one unit's full content, for a course whose outline is already imported. */
export function unitPrompt(s: PromptSettings, course: Course, moduleId: string, schema: string): string {
  const index = course.modules.findIndex((m) => m.id === moduleId);
  const unit = course.modules[index];
  if (!unit) return '';
  const earlier = course.modules.slice(0, index).map((m) => `"${m.title}"`);
  const outline = JSON.stringify(
    {
      id: course.id,
      title: course.title,
      modules: course.modules.map((m) => ({ id: m.id, title: m.title, summary: m.summary, lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, goal: l.goal })) }))
    },
    null,
    2
  );
  return join([
    role(s),
    `# Step ${index + 2}: write unit ${index + 1} of ${course.modules.length} - "${unit.title}"`,
    `Write the FULL content of unit "${unit.id}" ("${unit.title}") of the course "${course.title}" (id "${course.id}"). Keep the unit id, lesson ids, titles and goals from the outline exactly. Write every lesson completely now.`,
    earlier.length > 0
      ? `Earlier units (${earlier.join(', ')}) are already written. Build on them, do not re-teach them, and in the unit test mix in 1-2 questions that connect this unit to earlier ones.`
      : 'This is the first unit: assume nothing beyond what the learner already knows.',
    section('The course outline', '```json\n' + outline + '\n```'),
    learner(s),
    material(s, 'later'),
    languageRules(s),
    lessonRecipe(s),
    questionRules(s),
    section(
      'Unit test',
      list([
        `End the unit with "test": {"id": "${unit.id}-test", "type": "module-test", "questions": [ ${s.testQuestions} questions ]}.`,
        'The test covers every lesson of the unit, mixes the question kinds, and is a little harder than the lesson quizzes. Give each test question a "skillId" with the lesson id it checks (e.g. "' + (unit.lessons[0]?.id ?? `${unit.id}-l1`) + '").'
      ])
    ),
    section(
      'Glossary',
      list([
        'Give the unit a "glossary" with its 4-10 key technical terms: each with "term", a one-sentence "definition" and, where people use them, "aliases" (abbreviations, plurals, other spellings).',
        s.languageMode === 'bilingual' ? `Add "i18n" with the term and definition in both languages ("${s.primaryLanguage}" and "${s.secondLanguage}").` : '',
        'Use the term exactly as it appears in the lesson text, so the app can find and underline it.'
      ])
    ),
    idRules(course.id),
    extraInstructions(s),
    section('Schema (follow exactly)', schemaFor(s, schema)),
    outputRules(
      `{"courseId": "${course.id}", "module": {"id": "${unit.id}", "title": "${unit.title}", "summary": "...", "lessons": [ ...every lesson with all its blocks... ], "test": { ... }}}`
    ),
    selfCheck([`All ${unit.lessons.length || 'planned'} lessons of this unit are complete, each ending with a quiz of ${s.questionsPerLesson} questions.`, 'The unit test exists and has the right number of questions.'])
  ]);
}

/** Last step: a cumulative final exam for a course whose units are written. */
export function finalExamPrompt(s: PromptSettings, course: Course, schema: string): string {
  const units = course.modules.map((m, i) => `${i + 1}. ${m.title}: ${m.lessons.map((l) => l.title).join(', ')}`).join('\n');
  return join([
    role(s),
    `# Final step: the final exam for "${course.title}"`,
    `Write a cumulative final exam of ${s.finalExamQuestions} questions for the course "${course.title}" (id "${course.id}").`,
    section('What the course covers', units),
    learner(s),
    material(s, 'later'),
    languageRules(s),
    questionRules(s),
    section(
      'Exam design',
      list([
        'Cover every unit, weighted by how important it is. Mix units (interleave) instead of going unit by unit.',
        'Start with a few warm-up questions, then mostly application, and end with the hardest ones.',
        s.purpose === 'exam' && s.examDetails.trim() ? `Make it feel like the real exam: ${s.examDetails.trim()}` : '',
        'Give each question a "skillId" with the id of the lesson it checks.'
      ])
    ),
    idRules(course.id),
    extraInstructions(s),
    section('Schema (follow exactly)', schemaFor(s, schema)),
    outputRules(`{"courseId": "${course.id}", "finalExam": {"id": "final-exam", "type": "final-exam", "questions": [ ... ]}}`),
    selfCheck([`Exactly ${s.finalExamQuestions} questions, every unit represented.`])
  ]);
}

/** Everything in one reply: for small courses (a refresher) or tools with long replies. */
export function singlePrompt(s: PromptSettings, schema: string): string {
  const courseId = courseIdFor(s.topic);
  const languages = s.languageMode === 'bilingual' ? `["${s.primaryLanguage}", "${s.secondLanguage}"]` : `["${s.primaryLanguage}"]`;
  return join([
    role(s),
    '# Write the complete course in one reply',
    learner(s),
    material(s, 'outline'),
    section(
      'Plan',
      list([
        sizeText(s),
        'Order everything so each lesson only needs earlier lessons.',
        'Each lesson "goal" is one sentence with an observable verb: what the learner can DO afterwards.'
      ])
    ),
    languageRules(s),
    lessonRecipe(s),
    questionRules(s),
    section(
      'Tests',
      list([
        `Every unit ends with "test": {"id": "m1-test", "type": "module-test", "questions": [ ${s.testQuestions} questions ]} covering all its lessons; each question has a "skillId" with the lesson id it checks.`,
        s.finalExam
          ? `Add "finalExam": {"id": "final-exam", "type": "final-exam", "questions": [ ${s.finalExamQuestions} questions ]} covering the whole course, interleaving the units.`
          : 'No final exam.'
      ])
    ),
    idRules(courseId),
    extraInstructions(s),
    section('Schema (follow exactly)', schemaFor(s, schema)),
    outputRules(
      `{"schemaVersion": 2, "id": "${courseId}", "title": "...", "subject": "${s.subject.trim() || '...'}", "level": "...", "language": "${s.primaryLanguage}", "languages": ${languages}, "modules": [ ... ]${s.finalExam ? ', "finalExam": { ... }' : ''}}`
    ),
    selfCheck(['Every unit has its lessons and its test.'])
  ]);
}

/** The repair prompt: fix only what the app's validator reported. */
export function fixPrompt(errors: string, brokenJson: string): string {
  return join([
    'My learning app could not import the JSON below. It reported these problems:',
    errors.trim(),
    'Fix ONLY these problems. Do not change, add or remove anything else. Reply with the complete corrected JSON in ONE ```json code block and nothing else.',
    brokenJson.trim()
  ]);
}

/**
 * A second, separate check of a written unit (or the final exam). Asking a fresh chat to review
 * the content catches far more wrong answers than the writer's own self-check. The reply is the
 * corrected unit in the same import shape, so the learner just imports it again.
 */
export function checkPrompt(course: Course, target: string): string {
  const isExam = target === 'final-exam';
  const unit = isExam ? undefined : course.modules.find((m) => m.id === target);
  if (!isExam && !unit) return '';
  if (isExam && !course.finalExam) return '';
  const payload = isExam ? { courseId: course.id, finalExam: course.finalExam } : { courseId: course.id, module: unit };
  const what = isExam ? `the final exam of the course "${course.title}"` : `unit "${unit?.title ?? target}" of the course "${course.title}"`;
  const languages = (course.languages && course.languages.length > 0 ? course.languages : [course.language ?? 'en']).map(languageName);
  return join([
    `You are a careful subject expert and exam reviewer. Check ${what} below before a student studies it. You did not write it, so do not trust it: check everything yourself.`,
    section(
      'Check every question',
      list([
        'Solve the question yourself first, then compare with the given "answer". Is the marked answer really correct? Is there exactly one correct option where there should be one?',
        'Could a careful student argue that another option is also correct? Then reword the question or the option.',
        'Do the "explanation", "hint", "hints" and "rationales" match the correct answer and teach something? Does every option of a multiple-choice or multi-select question have a rationale?',
        'short-answer / fill-blank: is the answer one short term, and are all reasonable spellings and synonyms listed?',
        'Can the question be answered from what the lessons teach?'
      ])
    ),
    section(
      'Check the lessons',
      list([
        'Is every fact, definition, formula and number correct? Fix anything that is wrong or misleading.',
        'Is any YouTube link or reference likely to be invented? Remove links and references you are not certain exist.'
      ])
    ),
    section(
      'Rules for your fixes',
      list([
        'Keep every id, the structure and everything that is already correct exactly as it is.',
        'Only change what is wrong. Do not shorten, rewrite or "improve" correct content.',
        `Keep the language of the content (${languages.join(' and ')}), including any "i18n" translations.`
      ])
    ),
    section(
      'Reply',
      list([
        'First a short list of what you changed and why (at most 10 lines). If nothing was wrong, say so.',
        'Then the complete corrected JSON in ONE ```json code block, in exactly the same shape as below, so it can be imported again.'
      ])
    ),
    '```json\n' + JSON.stringify(payload, null, 2) + '\n```'
  ]);
}

/**
 * The "Stuck?" tutor prompt for one question. It gives the chat assistant the question but not the
 * answer, and tells it to coach instead of solving: a tutor that just hands over answers makes
 * learners do worse once it is gone, a tutor that makes them think does not.
 */
export function tutorPrompt(
  courseTitle: string,
  question: { prompt: string; options?: string[] },
  replyLanguage: string = 'en',
  given?: string
): string {
  const options =
    Array.isArray(question.options) && question.options.length > 0
      ? '\n\nThe options are:\n' + question.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')
      : '';
  return join([
    `I am studying "${courseTitle}" and I am stuck on this practice question:`,
    `"${question.prompt}"${options}`,
    given ? `My last answer was: "${given}". It was marked wrong.` : '',
    section(
      'How to help me',
      list([
        'Be my tutor, not an answer key. Do NOT tell me the answer or which option is correct, even if I ask.',
        'First ask me one short question to find out what I already understand.',
        'Then give me one small hint or one guiding question at a time and wait for my reply.',
        'If I make a mistake, point to the step that went wrong and let me fix it myself.',
        'When I have solved it, ask me to explain in one or two sentences WHY it is right.',
        `Keep every message short. Reply in ${languageName(replyLanguage)}.`
      ])
    )
  ]);
}

/** Tips shown next to the prompt for the chosen chat tool. Keys into the i18n file. */
export function toolTipKeys(tool: ChatTool): string[] {
  const common = ['create.tip.newChat', 'create.tip.cutOff'];
  switch (tool) {
    case 'chatgpt':
      return ['create.tip.chatgpt', ...common];
    case 'claude':
      return ['create.tip.claude', ...common];
    case 'gemini':
      return ['create.tip.gemini', ...common];
    case 'deepseek':
      return ['create.tip.deepseek', ...common];
    default:
      return common;
  }
}

/** Which unit prompts are still needed: units whose lessons have no content yet. */
export function unitStatus(course: Course): { moduleId: string; title: string; written: boolean }[] {
  return course.modules.map((m) => ({
    moduleId: m.id,
    title: m.title,
    written: m.lessons.length > 0 && m.lessons.every((l) => l.blocks.length > 0)
  }));
}
