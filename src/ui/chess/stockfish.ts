// Stockfish in a Web Worker, spoken to in UCI. Loaded the first time the Chess section needs it
// (about 7 MB, kept by the browser afterwards). One request runs at a time; the rest wait in line.
// Lines come back with scores from the side to move's point of view, as UCI sends them.

export interface EngineLine {
  move: string;
  cp?: number;
  mate?: number;
  pv: string[];
  depth: number;
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'failed';

let worker: Worker | null = null;
let status: EngineStatus = 'idle';
let readyPromise: Promise<boolean> | null = null;
let listener: ((line: string) => void) | null = null;
let queue: Promise<unknown> = Promise.resolve();
const statusWatchers = new Set<(s: EngineStatus) => void>();

function setStatus(s: EngineStatus) {
  status = s;
  for (const w of statusWatchers) w(s);
}

export function engineStatus(): EngineStatus {
  return status;
}

/** Calls `fn` now and on every status change; returns a function that stops it. */
export function watchEngineStatus(fn: (s: EngineStatus) => void): () => void {
  statusWatchers.add(fn);
  fn(status);
  return () => statusWatchers.delete(fn);
}

function engineUrl(): string {
  return new URL('engine/stockfish-18-lite-single.js', document.baseURI).href;
}

/** Starts loading the engine. Resolves true once it answers, false when it cannot run here. */
export function loadEngine(): Promise<boolean> {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise<boolean>((resolve) => {
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
      setStatus('failed');
      resolve(false);
      return;
    }
    setStatus('loading');
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!ok) {
        worker?.terminate();
        worker = null;
        readyPromise = null;
      }
      setStatus(ok ? 'ready' : 'failed');
      resolve(ok);
    };
    // A slow phone on a slow connection needs a while for 7 MB.
    const timer = setTimeout(() => finish(false), 60_000);
    try {
      worker = new Worker(engineUrl());
    } catch {
      finish(false);
      return;
    }
    worker.onmessage = (event: MessageEvent) => {
      const text = typeof event.data === 'string' ? event.data : '';
      if (text === 'uciok') worker?.postMessage('isready');
      else if (text === 'readyok' && !settled) finish(true);
      listener?.(text);
    };
    worker.onerror = () => finish(false);
    worker.postMessage('uci');
  });
  return readyPromise;
}

function send(cmd: string) {
  worker?.postMessage(cmd);
}

/** Runs one search and collects the final line for each multipv slot. */
function search(setup: string[], go: string, multipv: number): Promise<{ lines: EngineLine[]; bestmove: string | null }> {
  return new Promise((resolve) => {
    const lines: EngineLine[] = [];
    listener = (text) => {
      if (text.startsWith('info ') && text.includes(' pv ') && text.includes(' score ')) {
        const depth = Number(/ depth (\d+)/.exec(text)?.[1] ?? 0);
        const slot = Number(/ multipv (\d+)/.exec(text)?.[1] ?? 1);
        const score = / score (cp|mate) (-?\d+)/.exec(text);
        const pv = text.slice(text.indexOf(' pv ') + 4).trim().split(/\s+/);
        if (!score || !pv[0] || slot > multipv) return;
        // Bound scores ("lowerbound"/"upperbound") are partial; keep the last exact one.
        if (/ (lower|upper)bound/.test(text) && lines[slot - 1]) return;
        lines[slot - 1] = { move: pv[0], pv, depth, ...(score[1] === 'cp' ? { cp: Number(score[2]) } : { mate: Number(score[2]) }) };
      } else if (text.startsWith('bestmove')) {
        listener = null;
        const best = text.split(/\s+/)[1];
        resolve({ lines: lines.filter(Boolean), bestmove: best && best !== '(none)' ? best : null });
      }
    };
    for (const cmd of setup) send(cmd);
    send(go);
  });
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

export interface AnalyseOptions {
  depth?: number;
  movetime?: number;
  multipv?: number;
  /** Stockfish's strength limit (1320-3190), or undefined for full strength. */
  elo?: number;
}

/** Analyses a position. Returns null when the engine is not available. */
export async function analyse(fen: string, options: AnalyseOptions = {}): Promise<{ lines: EngineLine[]; bestmove: string | null } | null> {
  if (!(await loadEngine())) return null;
  const multipv = options.multipv ?? 1;
  return enqueue(() => {
    const setup = [
      `setoption name MultiPV value ${multipv}`,
      `setoption name UCI_LimitStrength value ${options.elo ? 'true' : 'false'}`,
      ...(options.elo ? [`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, Math.round(options.elo)))}`] : []),
      `position fen ${fen}`
    ];
    const parts = ['go'];
    if (options.depth) parts.push('depth', String(options.depth));
    if (options.movetime) parts.push('movetime', String(options.movetime));
    if (parts.length === 1) parts.push('depth', '12');
    return search(setup, parts.join(' '), multipv);
  });
}

/** Tells the engine a new game starts, so old search memory does not carry over. */
export function newGame() {
  if (status === 'ready') void enqueue(async () => send('ucinewgame'));
}
