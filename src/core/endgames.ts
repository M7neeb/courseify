// Endgame drills: basic endgames against an engine that defends as well as it can. Every
// position was checked with Stockfish: the "mate" and "promote" drills are wins for the
// learner, the "hold" drills are draws the learner must keep.

import type { Color, PlayGoal } from './chess.ts';

export interface EndgameDrill {
  id: string;
  fen: string;
  /** The learner's colour; the engine moves first when it is the other side to move. */
  learner: Color;
  goal: Extract<PlayGoal, 'mate' | 'promote' | 'hold'>;
  /** Moves allowed: a mate or promotion must come by then, a hold must last that long. */
  maxMoves: number;
  /** Moves a perfect player needs (for mates and promotions), from the engine. */
  par?: number;
  level: 'basic' | 'intermediate' | 'advanced';
}

export const ENDGAMES: readonly EndgameDrill[] = [
  { id: 'kq-k', fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', learner: 'w', goal: 'mate', maxMoves: 20, par: 9, level: 'basic' },
  { id: 'krr-k', fen: '8/8/3k4/8/8/8/8/R3K2R w - - 0 1', learner: 'w', goal: 'mate', maxMoves: 12, par: 5, level: 'basic' },
  { id: 'kr-k', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', learner: 'w', goal: 'mate', maxMoves: 30, par: 16, level: 'basic' },
  { id: 'kp-sixth', fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', learner: 'w', goal: 'promote', maxMoves: 10, par: 4, level: 'basic' },
  { id: 'kp-opposition', fen: '8/8/4k3/8/4K3/8/4P3/8 w - - 0 1', learner: 'w', goal: 'promote', maxMoves: 16, level: 'intermediate' },
  { id: 'kp-hold', fen: '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1', learner: 'b', goal: 'hold', maxMoves: 25, level: 'intermediate' },
  { id: 'kbb-k', fen: '8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1', learner: 'w', goal: 'mate', maxMoves: 32, par: 21, level: 'intermediate' },
  { id: 'lucena', fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', learner: 'w', goal: 'promote', maxMoves: 20, level: 'advanced' },
  { id: 'philidor', fen: '4k3/8/1r6/4PK2/8/8/8/R7 b - - 0 1', learner: 'b', goal: 'hold', maxMoves: 25, level: 'advanced' },
  { id: 'kbn-k', fen: '8/8/8/4k3/8/8/8/1N2KB2 w - - 0 1', learner: 'w', goal: 'mate', maxMoves: 45, par: 33, level: 'advanced' }
];

export function endgameById(id: string): EndgameDrill | undefined {
  return ENDGAMES.find((d) => d.id === id);
}
