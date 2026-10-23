import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALL_KINDS,
  DEFAULT_KINDS,
  PRESETS,
  applyPreset,
  checkPrompt,
  courseIdFor,
  defaultSettings,
  finalExamPrompt,
  fixPrompt,
  normalizeSettings,
  outlinePrompt,
  singlePrompt,
  toolTipKeys,
  tutorPrompt,
  unitPrompt,
  unitStatus,
  type PromptSettings
} from './promptBuilder.ts';
import { analyzeImport } from './import.ts';
import en from '../i18n/en.json' with { type: 'json' };
import type { Course } from './types.ts';

const schema = readFileSync(new URL('../prompts/schema.md', import.meta.url), 'utf8');
const sample = JSON.parse(readFileSync(new URL('../../examples/sample-course.json', import.meta.url), 'utf8')) as Course;

function settings(patch: Partial<PromptSettings> = {}): PromptSettings {
  return { ...defaultSettings(), topic: 'Subnetting', subject: 'IT', ...patch };
}

test('course ids are stable slugs that the validator accepts', () => {
  assert.equal(courseIdFor('Netzwerke & Subnetting'), 'netzwerke-subnetting');
  assert.equal(courseIdFor('Übungen zur Größe'), 'uebungen-zur-groesse');
  assert.equal(courseIdFor('  '), 'course');
  assert.match(courseIdFor('x'.repeat(80)), /^[a-z0-9-]{1,48}$/);
});

test('the outline prompt asks for an importable outline with the fixed id', () => {
  const s = settings();
  const prompt = outlinePrompt(s);
  assert.ok(prompt.includes('"id": "subnetting"'));
  assert.ok(prompt.includes('"blocks": []'));
  assert.ok(prompt.includes('```json'));
  assert.ok(!prompt.includes('{{'), 'no unfilled placeholders');
  // A reply in exactly the shape the prompt describes imports as a course.
  const reply = {
    schemaVersion: 2,
    id: courseIdFor(s.topic),
    title: 'Subnetting',
    subject: 'IT',
    language: 'de',
    languages: ['de', 'en'],
    modules: [{ id: 'm1', title: 'Basics', summary: 'IPv4 basics.', lessons: [{ id: 'm1-l1', title: 'Bits', goal: 'Convert to binary.', blocks: [] }] }]
  };
  const analysis = analyzeImport('```json\n' + JSON.stringify(reply) + '\n```');
  assert.equal(analysis.kind, 'course');
});

test('the unit prompt carries the outline, the unit ids and the import wrapper', () => {
  const prompt = unitPrompt(settings(), sample, 'm1', schema);
  assert.ok(prompt.includes(`"courseId": "${sample.id}"`));
  assert.ok(prompt.includes('"id": "m1-test"'));
  assert.ok(prompt.includes(sample.modules[0]!.title));
  assert.ok(prompt.includes('"skillId"'));
  assert.ok(prompt.includes('QUESTION KINDS'), 'the schema is included');
  assert.equal(unitPrompt(settings(), sample, 'missing', schema), '');
});

test('every setting that matters changes the prompt', () => {
  const base = unitPrompt(settings(), sample, 'm1', schema);
  const changes: Partial<PromptSettings>[] = [
    { languageMode: 'single' },
    { primaryLanguage: 'en', secondLanguage: 'de' },
    { termsLanguage: 'english' },
    { depth: 'thorough' },
    { threeLevels: false },
    { questionsPerLesson: 9 },
    { testQuestions: 17 },
    { kinds: ['multiple-choice', 'true-false'] },
    { difficulty: 'gentle' },
    { progressiveHints: false },
    { variants: false },
    { examOperators: false },
    { sourceMode: 'none' },
    { strictness: 'only' },
    { citeSources: false },
    { tone: 'very casual' },
    { extraInstructions: 'Always use IPv4 examples from a school network.' },
    { priorKnowledge: 'binary numbers' },
    { examDetails: '90 minutes, written' },
    { level: 'advanced' }
  ];
  for (const change of changes) {
    assert.notEqual(unitPrompt(settings(change), sample, 'm1', schema), base, `no effect: ${JSON.stringify(change)}`);
  }
  for (const key of Object.keys(defaultSettings().extras) as (keyof PromptSettings['extras'])[]) {
    const flipped = settings({ extras: { ...defaultSettings().extras, [key]: !defaultSettings().extras[key] } });
    assert.notEqual(unitPrompt(flipped, sample, 'm1', schema), base, `extra ${key} has no effect`);
  }
});

test('single-language prompts do not ask for i18n; bilingual ones do', () => {
  const single = unitPrompt(settings({ languageMode: 'single', primaryLanguage: 'fr' }), sample, 'm1', schema);
  assert.ok(single.includes('Do not add "i18n" objects'));
  assert.ok(single.includes('French'));
  const both = unitPrompt(settings(), sample, 'm1', schema);
  assert.ok(both.includes('BOTH German ("de") and English ("en")'));
});

test('the question rules carry the grading and item-writing constraints', () => {
  const prompt = unitPrompt(settings(), sample, 'm1', schema);
  for (const phrase of ['exact match', 'all of the above', 'misconceptions', 'variantGroup', 'Operatoren', 'hints']) {
    assert.ok(prompt.includes(phrase), `missing: ${phrase}`);
  }
});

test('pasted material goes into the prompt; attached material is referenced', () => {
  const pasted = outlinePrompt(settings({ sourceMode: 'pasted', material: 'Subnetting handout text' }));
  assert.ok(pasted.includes('<material>\nSubnetting handout text\n</material>'));
  const attached = outlinePrompt(settings({ sourceMode: 'attached' }));
  assert.ok(attached.includes('attached to this message'));
  const none = outlinePrompt(settings({ sourceMode: 'none' }));
  assert.ok(!none.includes('<material>'));
});

test('the final exam and one-reply prompts have the right wrappers', () => {
  const exam = finalExamPrompt(settings({ finalExamQuestions: 23 }), sample, schema);
  assert.ok(exam.includes('"finalExam": {"id": "final-exam"'));
  assert.ok(exam.includes('23'));
  const single = singlePrompt(settings({ finalExam: false }), schema);
  assert.ok(single.includes('No final exam.'));
  assert.ok(single.includes('"id": "subnetting"'));
});

test('the fix prompt contains the errors and the JSON', () => {
  const prompt = fixPrompt('modules[0].title: required text.', '{"x":1}');
  assert.ok(prompt.includes('modules[0].title: required text.'));
  assert.ok(prompt.endsWith('{"x":1}'));
});

test('presets apply on top of the current settings and keep untouched fields', () => {
  const s = applyPreset(settings({ topic: 'Python' }), 'programming');
  assert.equal(s.preset, 'programming');
  assert.equal(s.topic, 'Python');
  assert.equal(s.extras.code, true);
  assert.equal(applyPreset(s, 'custom').extras.code, true);
  for (const name of Object.keys(PRESETS)) assert.ok(applyPreset(settings(), name as keyof typeof PRESETS).preset === name);
});

test('saved settings are restored safely', () => {
  const restored = normalizeSettings({ topic: 'X', questionsPerLesson: 'many', kinds: ['matching', 'bogus'], extras: { code: true, nope: 1 } });
  assert.equal(restored.topic, 'X');
  assert.equal(restored.questionsPerLesson, defaultSettings().questionsPerLesson);
  assert.deepEqual(restored.kinds, ['matching']);
  assert.equal(restored.extras.code, true);
  assert.deepEqual(normalizeSettings(null), defaultSettings());
  assert.deepEqual(normalizeSettings({ kinds: [] }).kinds, DEFAULT_KINDS);
  // Picture questions need drawn diagrams, so a new course only gets them when asked for.
  assert.ok(ALL_KINDS.includes('hotspot') && !DEFAULT_KINDS.includes('hotspot'));
});

test('unit status tells written units from outline-only ones', () => {
  const outline: Course = structuredClone(sample);
  outline.modules[0]!.lessons = outline.modules[0]!.lessons.map((l) => ({ ...l, blocks: [] }));
  assert.deepEqual(unitStatus(sample).map((u) => u.written), [true]);
  assert.deepEqual(unitStatus(outline).map((u) => u.written), [false]);
});

test('every tool tip key exists in the English text file', () => {
  for (const tool of ['chatgpt', 'claude', 'gemini', 'deepseek', 'other'] as const) {
    for (const key of toolTipKeys(tool)) assert.ok(key in en, `missing i18n key ${key}`);
  }
});

test('lessons ask for warm-up guesses, further reading and misconception-first distractors', () => {
  const prompt = unitPrompt(settings(), sample, 'm1', schema);
  assert.ok(prompt.includes('guesses BEFORE reading'));
  assert.ok(prompt.includes('Read more'));
  assert.ok(prompt.includes('first solve it yourself'));
  assert.ok(prompt.includes('find the mistake'));
  const off = unitPrompt(settings({ extras: { ...defaultSettings().extras, warmup: false, reading: false } }), sample, 'm1', schema);
  assert.ok(!off.includes('guesses BEFORE reading'));
  assert.ok(!off.includes('Read more'));
});

test('old saved builder settings get the new lesson extras switched on', () => {
  const old = normalizeSettings({ extras: { examples: false } });
  assert.equal(old.extras.examples, false);
  assert.equal(old.extras.warmup, true);
  assert.equal(old.extras.reading, true);
});

test('the check prompt carries the unit in its import shape and the reply round-trips', () => {
  const prompt = checkPrompt(sample, 'm1');
  assert.ok(prompt.includes('Solve the question yourself first'));
  const json = prompt.slice(prompt.lastIndexOf('```json') + 7, prompt.lastIndexOf('```'));
  const payload = JSON.parse(json);
  assert.equal(payload.courseId, sample.id);
  assert.equal(payload.module.id, 'm1');
  assert.equal(analyzeImport('```json\n' + json + '\n```').kind, 'module');
  assert.equal(checkPrompt(sample, 'nope'), '');
});

test('the tutor prompt never contains the answer', () => {
  const question = { prompt: 'Which layer routes packets?', options: ['Physical', 'Network', 'Session'] };
  const prompt = tutorPrompt('Networks', question, 'de', 'Physical');
  assert.ok(prompt.includes('Do NOT tell me the answer'));
  assert.ok(prompt.includes('B) Network'));
  assert.ok(prompt.includes('German'));
  assert.ok(prompt.includes('"Physical"'));
  assert.ok(!/correct answer is/i.test(prompt));
});

test('the chess preset asks for boards and puzzles, and other courses never get them', () => {
  const chess = singlePrompt(applyPreset(settings({ topic: 'Chess tactics', subject: 'Chess' }), 'chess'), schema);
  assert.ok(chess.includes('CHESS (chess courses only)'));
  assert.ok(chess.includes('"kind": "chess"'));
  assert.ok(chess.includes('chess (a puzzle on a board'));
  assert.ok(chess.includes('"mode": "show"'));
  const plain = singlePrompt(settings(), schema);
  assert.ok(!plain.includes('CHESS (chess courses only)'));
  assert.ok(!plain.includes('chess (a puzzle'));
  assert.ok(!ALL_KINDS.includes('chess'));
  assert.equal(normalizeSettings({ extras: { chess: true } }).extras.chess, true);
});

test('the IT and maths presets ask for drill and graph blocks; other courses do not get them', () => {
  for (const preset of ['it', 'maths'] as const) {
    const out = singlePrompt(applyPreset(settings({ topic: 'Subnetting', subject: 'Networks' }), preset), schema);
    assert.ok(out.includes('PRACTICE BLOCKS'), preset);
    assert.ok(out.includes('"type": "drill"') && out.includes('subnet-network') && out.includes('"type": "graph"'), preset);
    assert.ok(out.includes('add a "drill" block right after the worked example'), preset);
  }
  const plain = singlePrompt(settings({ topic: 'History of Rome' }), schema);
  assert.ok(!plain.includes('PRACTICE BLOCKS'));
  assert.equal(normalizeSettings({ extras: { practice: true } }).extras.practice, true);
  assert.equal(normalizeSettings({}).extras.practice, false);
});
