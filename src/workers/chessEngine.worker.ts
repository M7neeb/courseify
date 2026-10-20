// Runs the chess engine off the main thread so the board never freezes while it thinks.
import { bestMove } from '../core/chessEngine.ts';

self.onmessage = (event: MessageEvent<{ id: number; fen: string; level: number }>) => {
  const { id, fen, level } = event.data;
  const result = bestMove(fen, level);
  self.postMessage({ id, ...result });
};
