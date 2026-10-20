// The app side of the chess engine: one shared Web Worker, with a plain fallback when workers are
// not available. Replies wait a moment so the computer does not answer instantly.
import { bestMove, type EngineResult } from '../../core/chessEngine.ts';

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, (result: EngineResult) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('../../workers/chessEngine.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<EngineResult & { id: number }>) => {
      const done = pending.get(event.data.id);
      pending.delete(event.data.id);
      done?.(event.data);
    };
    worker.onerror = () => {
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** The computer's move at a level (1-5), as UCI, after at least `minDelay` ms. */
export async function think(fen: string, level: number, minDelay = 450): Promise<EngineResult> {
  const started = Date.now();
  const w = getWorker();
  const result = await new Promise<EngineResult>((resolve) => {
    if (w) {
      const id = nextId++;
      pending.set(id, resolve);
      w.postMessage({ id, fen, level });
    } else {
      setTimeout(() => resolve(bestMove(fen, level)), 0);
    }
  });
  const left = minDelay - (Date.now() - started);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
  return result;
}
