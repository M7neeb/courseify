import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCourse } from './validate.ts';
import { gradeChess, readLine } from './chess.ts';
import type { Block, Course, Question } from './types.ts';

// The built-in chess course: it must pass the importer, and every puzzle solution must be accepted
// by the grader when played move by move.
const course = JSON.parse(readFileSync(new URL('../../courses/chess-to-1000.json', import.meta.url), 'utf8')) as Course;

function allQuestions(c: Course): Question[] {
  const blocks: Block[] = c.modules.flatMap((m) => [...m.lessons.flatMap((l) => l.blocks), ...(m.test ? [m.test] : [])]);
  return blocks.flatMap((b) => (Array.isArray(b.questions) ? (b.questions as Question[]) : []));
}

test('the chess course passes the importer', () => {
  const result = validateCourse(course);
  assert.equal(result.ok, true, result.errors.slice(0, 5).join('\n'));
});

test('every chess puzzle is solved by its own solution and by nothing shorter', () => {
  const puzzles = allQuestions(course).filter((q) => q.kind === 'chess');
  assert.ok(puzzles.length >= 100, `only ${puzzles.length} puzzles`);
  for (const q of puzzles) {
    const read = readLine(q.fen!, q.solution!);
    assert.ok('line' in read, q.id);
    if ('line' in read) {
      assert.equal(gradeChess(q, read.line.uci), true, q.id);
      if (read.line.uci.length > 1) assert.equal(gradeChess(q, read.line.uci.slice(0, -2)), false, q.id);
    }
    assert.match(q.source ?? '', /^lichess\.org\/training\/\w+$/);
  }
  const ids = puzzles.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});
