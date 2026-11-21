import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseFromTerms, detectSeparator, parseTermList, type Term } from './termList.ts';
import { validateCourse } from './validate.ts';
import { gradeAnswer } from './grade.ts';
import type { Question } from './types.ts';

const quizlet = 'RAM\tArbeitsspeicher, flüchtig\nROM\tNur-Lese-Speicher\nCPU\tProzessor\nGPU\tGrafikprozessor\nSSD\tFlash-Speicher ohne bewegte Teile';

test('a Quizlet export (tab between term and meaning) is read line by line', () => {
  const list = parseTermList(quizlet);
  assert.equal(list.separator, '\t');
  assert.equal(list.terms.length, 5);
  assert.deepEqual(list.terms[0], { term: 'RAM', meaning: 'Arbeitsspeicher, flüchtig' });
});

test('typed dashes split at the first dash, so a meaning may contain more of them', () => {
  const list = parseTermList('LAN - local area network\nWAN - wide area network - spans cities\nDNS - names to addresses\nNAT - shares one public address');
  assert.equal(list.separator, ' - ');
  assert.equal(list.terms[1].meaning, 'wide area network - spans cities');
});

test('a meaning with a comma does not make the comma the separator when every line has a semicolon', () => {
  const list = parseTermList('Hub;sends to every port, dumb\nSwitch;learns MAC addresses\nRouter;joins networks\nBridge;joins two segments, old');
  assert.equal(list.separator, ';');
  assert.equal(list.terms[0].meaning, 'sends to every port, dumb');
});

test('CSV with quoted fields keeps the commas inside the quotes', () => {
  const list = parseTermList('"TCP","reliable, ordered"\n"UDP","fast, no guarantee"\nIP,addressing\nICMP,"ping, errors"');
  assert.equal(list.separator, ',');
  assert.deepEqual(list.terms[0], { term: 'TCP', meaning: 'reliable, ordered' });
  assert.deepEqual(list.terms[3], { term: 'ICMP', meaning: 'ping, errors' });
});

test('an Anki text export loses its header lines and HTML', () => {
  const anki = '#separator:tab\n#html:true\nOSI<br>model\tSeven <b>layers</b>&nbsp;of networking\nTCP\tTransport layer\nIP\tNetwork layer\nHTTP\tApplication layer &amp; web';
  const list = parseTermList(anki);
  assert.equal(list.terms.length, 4);
  assert.deepEqual(list.terms[0], { term: 'OSI model', meaning: 'Seven layers of networking' });
  assert.equal(list.terms[3].meaning, 'Application layer & web');
});

test('lines without a separator are listed as skipped, repeated terms as duplicates', () => {
  const list = parseTermList('A - one\nB - two\nC - three\nD - four\nE - five\nJust a heading line\nb - again');
  assert.equal(list.terms.length, 5);
  assert.deepEqual(list.skipped, ['Just a heading line']);
  assert.deepEqual(list.duplicates, ['b']);
});

test('prose, JSON and a single line are not term lists', () => {
  assert.equal(detectSeparator('This is a paragraph about networks.\nIt has two sentences and no pairs.'), null);
  assert.equal(detectSeparator('{ "schemaVersion": 2, "id": "x" }'), null);
  assert.equal(detectSeparator('one - line'), null);
  assert.equal(detectSeparator(''), null);
});

const many: Term[] = Array.from({ length: 23 }, (_, i) => ({ term: `Term ${i + 1}`, meaning: `Meaning number ${i + 1}` }));

test('the course passes the importer\'s own checks, in both languages', () => {
  for (const language of ['en', 'de'] as const) {
    const course = courseFromTerms(many, { title: 'Netzwerk-Begriffe', language });
    const result = validateCourse(course);
    assert.deepEqual(result.errors, [], language);
    assert.equal(course.id, 'list-netzwerk-begriffe');
  }
});

test('23 terms make 3 lessons in one unit (8 per lesson), and every term is asked in the unit test', () => {
  const course = courseFromTerms(many, { title: 'x', language: 'en' });
  assert.equal(course.modules.length, 1);
  assert.deepEqual(course.modules[0].lessons.map((l) => l.title), ['Terms 1 to 8', 'Terms 9 to 16', 'Terms 17 to 23']);
  const testQuestions = (course.modules[0].test!.questions as Question[]);
  assert.equal(testQuestions.length, 23);
  assert.equal(new Set(testQuestions.map((q) => q.id)).size, 23);
  // Test questions count toward the lesson that taught the term.
  assert.equal(testQuestions[22].skillId, 'u1-l17');
  assert.equal(course.modules[0].glossary!.length, 23);
});

test('more than 40 terms are split into units of five lessons', () => {
  const big = Array.from({ length: 95 }, (_, i) => ({ term: `T${i}`, meaning: `M${i}` }));
  const course = courseFromTerms(big, { title: 'big', language: 'en' });
  assert.deepEqual(course.modules.map((m) => m.lessons.length), [5, 5, 2]);
  assert.deepEqual(validateCourse(course).errors, []);
});

test('every generated question is answered right by its own answer, and options never repeat', () => {
  const course = courseFromTerms(many, { title: 'x', language: 'en' });
  for (const lesson of course.modules[0].lessons) {
    const quiz = lesson.blocks.find((b) => b.type === 'quiz')!;
    for (const q of quiz.questions as Question[]) {
      if (q.kind === 'multiple-choice') {
        assert.equal(new Set(q.options).size, q.options!.length, q.id);
        assert.ok(gradeAnswer(q, q.answer), q.id);
      }
      if (q.kind === 'short-answer') assert.ok(gradeAnswer(q, (q.answer as string[])[0]), q.id);
    }
  }
});

test('the meaning question names the right meaning, the term question the right term', () => {
  const course = courseFromTerms(many, { title: 'x', language: 'en' });
  const qs = course.modules[0].lessons[0].blocks.find((b) => b.type === 'quiz')!.questions as Question[];
  const meaning = qs.find((q) => q.id.endsWith('-meaning') && q.prompt.includes('**Term 5**'))!;
  assert.equal(meaning.options![meaning.answer as number], 'Meaning number 5');
  const term = qs.find((q) => q.id.endsWith('-term') && q.prompt.endsWith('Meaning number 5'))!;
  assert.equal(term.options![term.answer as number], 'Term 5');
});

test('the right option is not always in the same place', () => {
  const course = courseFromTerms(many, { title: 'x', language: 'en' });
  const qs = course.modules[0].lessons.flatMap((l) => l.blocks.find((b) => b.type === 'quiz')!.questions as Question[]);
  const positions = new Set(qs.filter((q) => q.kind === 'multiple-choice').map((q) => q.answer));
  assert.ok(positions.size >= 3, [...positions].join());
});

test('typing the term without its bracketed note also counts', () => {
  const course = courseFromTerms(
    [{ term: 'RAM (Arbeitsspeicher)', meaning: 'flüchtiger Speicher' }, ...many.slice(0, 4)],
    { title: 'x', language: 'de' }
  );
  const typed = (course.modules[0].lessons[0].blocks.find((b) => b.type === 'quiz')!.questions as Question[]).find((q) => q.kind === 'short-answer')!;
  assert.equal(typed.prompt, 'Schreib den Begriff: flüchtiger Speicher');
  assert.ok(gradeAnswer(typed, 'ram'));
  assert.ok(gradeAnswer(typed, 'RAM (Arbeitsspeicher)'));
});

test('importing the list again with a new term at the end keeps every question id of the old terms', () => {
  const before = courseFromTerms(many, { title: 'x', language: 'en' });
  const after = courseFromTerms([...many, { term: 'New', meaning: 'Brand new' }], { title: 'x', language: 'en' });
  const ids = (c: typeof before) =>
    c.modules.flatMap((m) => m.lessons.flatMap((l) => (l.blocks.find((b) => b.type === 'quiz')!.questions as Question[]).map((q) => q.id)));
  const afterIds = new Set(ids(after));
  for (const id of ids(before)) assert.ok(afterIds.has(id), id);
});

test('a short list of four terms still gives every multiple-choice question three wrong options', () => {
  const course = courseFromTerms(many.slice(0, 4), { title: 'x', language: 'en' });
  const qs = course.modules[0].lessons[0].blocks.find((b) => b.type === 'quiz')!.questions as Question[];
  for (const q of qs.filter((q) => q.kind === 'multiple-choice')) assert.equal(q.options!.length, 4, q.id);
  assert.deepEqual(validateCourse(course).errors, []);
});

test('a pipe in a term does not break the lesson table', () => {
  const course = courseFromTerms([{ term: 'a|b', meaning: 'or' }, ...many.slice(0, 3)], { title: 'x', language: 'en' });
  const table = course.modules[0].lessons[0].blocks[0].levels as { normal: string };
  assert.match(table.normal, /\*\*a\\\|b\*\*/);
});

test('broken JSON is never mistaken for a term list, so its errors are still shown', () => {
  const broken = '{\n  "schemaVersion": 2,\n  "id": "x",\n  "title": "Broken",\n  "subject": "IT",\n  "modules": [\n';
  assert.equal(detectSeparator(broken), null);
  assert.equal(detectSeparator('[\n"a": 1,\n"b": 2,\n"c": 3,\n"d": 4\n'), null);
});

test('lesson goals and unit titles read cleanly', () => {
  const course = courseFromTerms(many, { title: 'x', language: 'de' });
  assert.equal(course.modules[0].title, 'Term 1 – Term 23');
  assert.equal(course.modules[0].lessons[0].goal, 'Wissen, was das bedeutet: Term 1, Term 2, Term 3 …');
  const short = courseFromTerms(many.slice(0, 3).concat(many.slice(3, 4)), { title: 'x', language: 'en', perLesson: 3 });
  assert.equal(short.modules[0].lessons[0].goal, 'Know what these mean: Term 1, Term 2, Term 3.');
});
