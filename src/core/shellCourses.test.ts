import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createShell, goalMet, runShell, type Fs, type ShellGoal } from './shell.ts';

// Every shell question of every built-in course: its goal is not met at the start, and the model
// answer (commands separated by ";") reaches it.
const dir = new URL('../../courses/', import.meta.url);

interface ShellQ { id: string; kind: string; fs: Fs; cwd?: string; goal: ShellGoal; answer: string }

function* shellQuestions(node: unknown): Generator<ShellQ> {
  if (Array.isArray(node)) for (const n of node) yield* shellQuestions(n);
  else if (typeof node === 'object' && node !== null) {
    const o = node as Record<string, unknown>;
    if (o.kind === 'shell') yield o as unknown as ShellQ;
    for (const [key, v] of Object.entries(o)) if (key !== 'i18n') yield* shellQuestions(v);
  }
}

test('every shell question starts unsolved and is solved by its model answer', () => {
  let count = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const course = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    for (const q of shellQuestions(course)) {
      count += 1;
      const start = createShell(q.fs, q.cwd ?? '/home/anna');
      assert.equal(goalMet(q.goal, start), false, `${file} ${q.id}: already solved at the start`);
      const shell = createShell(q.fs, q.cwd ?? '/home/anna');
      for (const command of q.answer.split(';')) runShell(shell, command);
      assert.equal(goalMet(q.goal, shell), true, `${file} ${q.id}: the model answer "${q.answer}" does not solve it`);
    }
  }
  assert.ok(count >= 20, `expected the Linux course questions, found ${count}`);
});
