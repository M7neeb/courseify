// Runs learner code safely away from the page: JavaScript in a throwaway Web Worker, Python in a
// worker with Pyodide (loaded the first time, about 12 MB, then kept by the browser). A run that
// takes too long (an endless loop) is stopped by ending the worker.

import type { CodeTest } from '../../core/types.ts';

export interface TestResult {
  passed: boolean;
  got?: string;
  expected?: string;
  error?: string;
}

export interface RunResult {
  output: string;
  error: string;
  tests: TestResult[];
  timedOut?: boolean;
}

export type CodeLanguage = 'python' | 'javascript';

// ---------- JavaScript ----------

// The worker's own code: run the program with console.log captured, then each test call.
const JS_WORKER = `
function show(v) {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}
function same(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every(function (x, i) { return same(x, b[i]); });
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    var ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every(function (k, i) { return k === kb[i] && same(a[k], b[k]); });
  }
  return a === b;
}
function tidy(t) { return String(t).replace(/\\r\\n/g, '\\n').split('\\n').map(function (l) { return l.replace(/\\s+$/, ''); }).join('\\n').trim(); }
// Code from a course or a learner never gets at the app's saved data or the network.
['indexedDB', 'caches', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'EventSource'].forEach(function (k) {
  try { Object.defineProperty(self, k, { value: undefined, configurable: false }); } catch (e) {}
});
self.onmessage = function (event) {
  var code = event.data.code, tests = event.data.tests || [];
  var out = '';
  var log = function () { out += Array.prototype.map.call(arguments, show).join(' ') + '\\n'; };
  self.console = { log: log, info: log, warn: log, error: log };
  var calls = tests.filter(function (t) { return typeof t.call === 'string'; });
  var source = code + '\\n;[' + calls.map(function (t) {
    return '(function(){try{return {v:(' + t.call + ')}}catch(e){return {e:String(e)}}})()';
  }).join(',') + ']';
  var values = [], error = '';
  try { values = (0, eval)(source) || []; } catch (e) { error = String(e); }
  var programOut = out;
  var results = [], ci = 0;
  tests.forEach(function (t) {
    if (typeof t.call === 'string') {
      var r = values[ci++];
      if (error || !r) results.push({ passed: false, error: error || 'No result' });
      else if ('e' in r) results.push({ passed: false, error: r.e, expected: JSON.stringify(t.expect) });
      else results.push({ passed: same(JSON.parse(JSON.stringify(r.v === undefined ? null : r.v)), t.expect), got: JSON.stringify(r.v), expected: JSON.stringify(t.expect) });
    } else if (typeof t.output === 'string') {
      results.push(error ? { passed: false, error: error, expected: t.output } : { passed: tidy(programOut) === tidy(t.output), got: tidy(programOut), expected: tidy(t.output) });
    }
  });
  self.postMessage({ output: programOut, error: error, tests: results });
};
`;

function runJs(code: string, tests: readonly CodeTest[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([JS_WORKER], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const timer = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ output: '', error: '', tests: tests.map(() => ({ passed: false })), timedOut: true });
    }, timeoutMs);
    worker.onmessage = (event: MessageEvent<RunResult>) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(event.data);
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ output: '', error: event.message || 'Error', tests: tests.map(() => ({ passed: false })) });
    };
    worker.postMessage({ code, tests: JSON.parse(JSON.stringify(tests)) });
  });
}

// ---------- Python ----------

let pyWorker: Worker | null = null;
let pyReady = false;
let nextId = 1;
const pyWaiting = new Map<number, (r: RunResult) => void>();
const statusWatchers = new Set<(loading: boolean) => void>();

function pythonWorker(): Worker {
  if (pyWorker) return pyWorker;
  pyWorker = new Worker(new URL('pyodide/runner.js', document.baseURI).href);
  pyWorker.onmessage = (event: MessageEvent<RunResult & { id: number }>) => {
    pyReady = true;
    for (const w of statusWatchers) w(false);
    const done = pyWaiting.get(event.data.id);
    pyWaiting.delete(event.data.id);
    done?.(event.data);
  };
  pyWorker.onerror = () => {
    for (const [, done] of pyWaiting) done({ output: '', error: 'Python could not start. Connect to the internet once so it can download.', tests: [] });
    pyWaiting.clear();
    pyWorker?.terminate();
    pyWorker = null;
    pyReady = false;
  };
  return pyWorker;
}

/** Calls `fn(true)` while Python is still loading for the first time. */
export function watchPythonLoading(fn: (loading: boolean) => void): () => void {
  statusWatchers.add(fn);
  return () => statusWatchers.delete(fn);
}

export function pythonIsReady(): boolean {
  return pyReady;
}

function runPython(code: string, tests: readonly CodeTest[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    const worker = pythonWorker();
    const id = nextId++;
    if (!pyReady) for (const w of statusWatchers) w(true);
    // The first run also loads Python, so it gets extra time.
    const limit = pyReady ? timeoutMs : timeoutMs + 60_000;
    const timer = setTimeout(() => {
      pyWaiting.delete(id);
      // An endless loop cannot be interrupted: end the worker; the next run starts a fresh one.
      pyWorker?.terminate();
      pyWorker = null;
      pyReady = false;
      resolve({ output: '', error: '', tests: tests.map(() => ({ passed: false })), timedOut: true });
    }, limit);
    pyWaiting.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    worker.postMessage({ id, code, tests: JSON.parse(JSON.stringify(tests)) });
  });
}

/** Runs code and its tests. */
export function runCode(language: CodeLanguage, code: string, tests: readonly CodeTest[] = [], timeoutMs = 5000): Promise<RunResult> {
  return language === 'python' ? runPython(code, tests, timeoutMs) : runJs(code, tests, timeoutMs);
}
