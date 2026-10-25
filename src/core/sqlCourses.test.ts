import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compareTables, type SqlTable } from './sqlCompare.ts';

// Every SQL question of every built-in course: the setup script runs, the model answer returns a
// table, and the model answer passes its own comparison. Uses the same sql.js as the app.
const require = createRequire(import.meta.url);
const dir = new URL('../../courses/', import.meta.url);

interface SqlQ { id: string; kind: string; setup: string; answer: string; ordered?: boolean }

function* sqlQuestions(node: unknown): Generator<SqlQ> {
  if (Array.isArray(node)) for (const n of node) yield* sqlQuestions(n);
  else if (typeof node === 'object' && node !== null) {
    const o = node as Record<string, unknown>;
    if (o.kind === 'sql') yield o as unknown as SqlQ;
    for (const [key, v] of Object.entries(o)) if (key !== 'i18n') yield* sqlQuestions(v);
  }
}

test('every SQL question has a working setup and a model answer that returns a table', async () => {
  const initSqlJs = require('sql.js') as (config?: object) => Promise<{ Database: new () => { exec(sql: string): { columns: string[]; values: unknown[][] }[]; close(): void } }>;
  const SQL = await initSqlJs();
  let count = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const course = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    for (const q of sqlQuestions(course)) {
      count += 1;
      const db = new SQL.Database();
      try {
        db.exec(q.setup);
        const results = db.exec(q.answer);
        const last = results[results.length - 1];
        assert.ok(last && last.values.length > 0, `${file} ${q.id}: the model answer returns no rows`);
        const table: SqlTable = { columns: last.columns, rows: last.values.map((r) => r.map((v) => (v === null ? 'NULL' : String(v)))) };
        assert.deepEqual(compareTables(table, table, q.ordered === true), { same: true });
      } finally {
        db.close();
      }
    }
  }
  assert.ok(count >= 30, `expected the SQL course questions, found ${count}`);
});
