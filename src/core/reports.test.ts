import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allQuestions, fixQuestionsPrompt, replaceQuestions, reportedQuestions } from './reports.ts';
import { analyzeImport, applyQuestions } from './import.ts';
import type { Course, Question } from './types.ts';

const course = JSON.parse(readFileSync(new URL('../../examples/sample-course.json', import.meta.url), 'utf8')) as Course;

test('reported questions are found with where they are, and the prompt asks for the import shape', () => {
  const first = allQuestions(course)[0]!;
  const reported = reportedQuestions(course, { [first.question.id]: { reason: 'wrong', note: 'should be B', at: '2026-10-22' }, missing: { reason: 'typo', at: 'x' } });
  assert.equal(reported.length, 1);
  assert.ok(reported[0]!.where.includes('/'));
  const prompt = fixQuestionsPrompt(course, reported);
  assert.ok(prompt.includes(first.question.id));
  assert.ok(prompt.includes('should be B'));
  assert.ok(prompt.includes(`{"courseId": "${course.id}", "questions": [`));
});

test('corrected questions replace the old ones by id, and unknown ids are refused', () => {
  const first = allQuestions(course)[0]!.question;
  const fixed: Question = { ...first, explanation: 'Corrected explanation.' };
  const { course: next, missing } = replaceQuestions(course, [fixed]);
  assert.deepEqual(missing, []);
  assert.equal(allQuestions(next)[0]!.question.explanation, 'Corrected explanation.');
  // The original course is untouched.
  assert.notEqual(allQuestions(course)[0]!.question.explanation, 'Corrected explanation.');
  const refused = applyQuestions(course, [{ ...fixed, id: 'nope' }]);
  assert.equal(refused.ok, false);
  assert.ok(refused.errors[0]!.includes('nope'));
});

test('the import recognises corrected questions and checks them', () => {
  const first = allQuestions(course)[0]!.question;
  const ok = analyzeImport(JSON.stringify({ courseId: course.id, questions: [first] }));
  assert.equal(ok.kind, 'questions');
  if (ok.kind === 'questions') assert.equal(ok.courseId, course.id);
  const bad = analyzeImport(JSON.stringify({ courseId: course.id, questions: [{ id: 'x', kind: 'multiple-choice', prompt: 'p' }] }));
  assert.equal(bad.kind, 'error');
});
