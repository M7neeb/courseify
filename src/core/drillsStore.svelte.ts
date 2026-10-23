// What the Drills page remembers per drill: the level last chosen, problems solved, and the best
// run of right-first-time answers.

import { storage } from './storage.ts';
import type { Level } from './drills.ts';

export interface DrillStat {
  solved: number;
  best: number;
  level?: Level;
}

export const drillStats = $state({ loaded: false, stats: {} as Record<string, DrillStat> });

export async function loadDrillStats(): Promise<void> {
  if (drillStats.loaded) return;
  const saved = await storage.getRecord<Record<string, DrillStat>>('drills');
  drillStats.stats = saved && typeof saved === 'object' ? saved : {};
  drillStats.loaded = true;
}

function save(): Promise<void> {
  return storage.saveRecord('drills', $state.snapshot(drillStats.stats));
}

export function statFor(id: string): DrillStat {
  return drillStats.stats[id] ?? { solved: 0, best: 0 };
}

export function setDrillLevel(id: string, level: Level): Promise<void> {
  drillStats.stats[id] = { ...statFor(id), level };
  return save();
}

/** Counts one solved problem, and a run length when it beats the best. */
export function recordDrill(id: string, solved: boolean, streak: number): Promise<void> {
  const s = statFor(id);
  drillStats.stats[id] = { ...s, solved: s.solved + (solved ? 1 : 0), best: Math.max(s.best, streak) };
  return save();
}
