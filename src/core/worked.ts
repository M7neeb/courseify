// Worked examples that fade: a numbered solution loses its last steps as the learner's skill grows,
// so they have to work the missing steps out themselves. At "Mastered" the example is shown whole.

import type { MasteryTier } from './types.ts';

export interface WorkedSplit {
  before: string;
  /** Each step with its own number ("3. text"), so it renders with the right number alone. */
  steps: string[];
  after: string;
}

const ITEM = /^\s{0,3}\d+[.)]\s+/;

/** Splits markdown into the text before a numbered list, its items, and the text after it. */
export function splitWorked(markdown: string): WorkedSplit | null {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => ITEM.test(l));
  if (start < 0) return null;
  const steps: string[][] = [];
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (ITEM.test(line)) {
      steps.push([line]);
      continue;
    }
    if (line.trim() === '') {
      // A blank line ends the list unless the next text line is indented (more of the same step) or another item.
      const nextLine = lines.slice(i + 1).find((l) => l.trim() !== '');
      if (nextLine !== undefined && (ITEM.test(nextLine) || /^\s{2,}\S/.test(nextLine))) {
        steps[steps.length - 1].push(line);
        continue;
      }
      end = i;
      break;
    }
    if (/^\s+\S/.test(line) || steps.length > 0) {
      // A continuation line of the step before it (a lazy continuation is allowed in markdown).
      if (/^\s{0,3}(#|>|```|-{3,}|\*{3,})/.test(line)) {
        end = i;
        break;
      }
      steps[steps.length - 1].push(line);
    }
  }
  if (steps.length === 0) return null;
  return {
    before: lines.slice(0, start).join('\n'),
    steps: steps.map((s) => s.join('\n').trimEnd()),
    after: lines.slice(end).join('\n').trim()
  };
}

/** How many of the last steps are hidden for this skill level. The first step always stays. */
export function hiddenSteps(stepCount: number, tier: MasteryTier): number {
  if (stepCount < 3) return 0;
  const byTier: Record<MasteryTier, number> = { 'not-started': 0, attempted: 1, familiar: 2, proficient: 3, mastered: 0 };
  return Math.min(byTier[tier], stepCount - 1);
}
