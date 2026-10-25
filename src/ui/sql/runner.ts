// Runs SQL in a worker (public/sql/sql-worker.js, sql.js) and compares results. A query that runs
// too long is stopped after a few seconds.

import { compareTables, type SqlTable, type SqlVerdict } from '../../core/sqlCompare.ts';

export interface SchemaTable {
  name: string;
  rows: number;
  columns: { name: string; type: string; pk: boolean }[];
}

interface Reply {
  id: number;
  result?: SqlTable;
  expected?: SqlTable;
  schema?: SchemaTable[];
  error?: string;
  fatal?: string;
}

const TIMEOUT_MS = 5000;
let counter = 0;

function ask(message: { setup: string; query?: string; reference?: string; schema?: boolean }): Promise<Reply | 'timeout'> {
  return new Promise((resolve) => {
    const id = ++counter;
    const worker = new Worker(`${import.meta.env.BASE_URL}sql/sql-worker.js`);
    const timer = setTimeout(() => {
      worker.terminate();
      resolve('timeout');
    }, TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<Reply>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ id, fatal: 'The SQL engine could not start.' });
    };
    worker.postMessage({ id, ...message });
  });
}

export interface SqlRun {
  table?: SqlTable;
  error?: string;
  timedOut?: boolean;
}

/** The tables of the practice database, for the schema panel. */
export async function loadSchema(setup: string): Promise<SchemaTable[]> {
  const reply = await ask({ setup, schema: true });
  return reply === 'timeout' ? [] : (reply.schema ?? []);
}

export async function runSql(setup: string, query: string): Promise<SqlRun> {
  const reply = await ask({ setup, query });
  if (reply === 'timeout') return { timedOut: true };
  if (reply.fatal) return { error: reply.fatal };
  return reply.error ? { error: reply.error } : { table: reply.result };
}

export interface SqlCheck extends SqlRun {
  verdict?: SqlVerdict;
}

/** Runs the learner's query and the model answer on the same fresh database and compares the tables. */
export async function checkSql(setup: string, query: string, reference: string, ordered: boolean): Promise<SqlCheck> {
  const reply = await ask({ setup, query, reference });
  if (reply === 'timeout') return { timedOut: true };
  if (reply.fatal) return { error: reply.fatal };
  if (reply.error) return { error: reply.error };
  if (!reply.result || !reply.expected) return { error: 'No result.' };
  return { table: reply.result, verdict: compareTables(reply.result, reply.expected, ordered) };
}
