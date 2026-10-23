// Courseify: runs a learner's Python code in this worker with Pyodide, then its tests.
// A message is { id, code, tests: [{ call, expect } | { output, stdin }] }; the answer is
// { id, output, error, tests: [{ passed, got, expected, error }] }. Each run gets a fresh namespace.
/* global importScripts, loadPyodide */
importScripts('./pyodide.js');

const ready = loadPyodide({ indexURL: './' });

function shortError(e) {
  const text = String((e && e.message) || e);
  // Keep the useful end of a traceback: the line in the learner's code and the error itself.
  const lines = text.trim().split('\n');
  const fromExec = lines.findIndex((l) => l.includes('File "<exec>"'));
  return (fromExec >= 0 ? lines.slice(fromExec) : lines.slice(-3)).join('\n').trim();
}

function same(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && same(a[k], b[k]));
  }
  return a === b;
}

function tidy(text) {
  return String(text).replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();
}

async function runProgram(pyodide, code, stdin) {
  let out = '';
  const lines = String(stdin || '').split('\n');
  pyodide.setStdout({ batched: (s) => (out += s + '\n') });
  pyodide.setStderr({ batched: (s) => (out += s + '\n') });
  pyodide.setStdin({ stdin: () => (lines.length ? lines.shift() : null) });
  const ns = pyodide.globals.get('dict')();
  let error = '';
  try {
    await pyodide.runPythonAsync(code, { globals: ns });
  } catch (e) {
    error = shortError(e);
  }
  return { out, error, ns };
}

// Once Python is loaded, code from a course or a learner never gets at the app's saved data or
// the network (Python's "js" module could otherwise reach them).
const locked = ready.then((py) => {
  for (const k of ['indexedDB', 'caches', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'EventSource']) {
    try {
      Object.defineProperty(self, k, { value: undefined, configurable: false });
    } catch (e) {
      /* already gone */
    }
  }
  return py;
});

self.onmessage = async (event) => {
  const { id, code, tests } = event.data;
  let pyodide;
  try {
    pyodide = await locked;
  } catch (e) {
    self.postMessage({ id, output: '', error: 'Python could not start: ' + shortError(e), tests: [] });
    return;
  }
  const list = Array.isArray(tests) ? tests : [];
  const callTests = list.filter((t) => typeof t.call === 'string');
  const main = await runProgram(pyodide, code, '');
  const results = [];
  for (const t of list) {
    if (typeof t.call === 'string') {
      if (main.error) {
        results.push({ passed: false, error: main.error });
        continue;
      }
      try {
        const json = pyodide.runPython('import json as __j\n__j.dumps(' + t.call + ')', { globals: main.ns });
        const got = JSON.parse(json);
        results.push({ passed: same(got, t.expect), got: json, expected: JSON.stringify(t.expect) });
      } catch (e) {
        results.push({ passed: false, error: shortError(e), expected: JSON.stringify(t.expect) });
      }
    } else if (typeof t.output === 'string') {
      const run = callTests.length === 0 && !t.stdin ? main : await runProgram(pyodide, code, t.stdin);
      results.push(run.error ? { passed: false, error: run.error, expected: t.output } : { passed: tidy(run.out) === tidy(t.output), got: tidy(run.out), expected: tidy(t.output) });
    }
  }
  self.postMessage({ id, output: main.out, error: main.error, tests: results });
};
