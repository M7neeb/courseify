// Keeps the weekly report and milestones up to date: a snapshot of every skill's points at the
// start of each week (so the report can say what grew), last week's finished report, and the
// dates milestones were first earned.

import { app, showToast } from './state.svelte.ts';
import { storage } from './storage.ts';
import { t } from '../i18n/i18n.ts';
import { computeStats, dayKey } from './activity.ts';
import { courseSkills, isMasterable, skillPoints, tierForPoints } from './mastery.ts';
import { coursesCompleted } from './home.ts';
import { ENDGAMES } from './endgames.ts';
import { botById } from './bots.ts';
import { longestStreak, milestoneStates, weekReport, weekStart, type MilestoneInput, type MilestoneState, type WeekReport, type WeekSnapshot } from './goals.ts';

interface WeeklyRecord {
  current?: WeekSnapshot;
  lastReport?: WeekReport;
  /** The week whose report was put away. */
  dismissed?: string;
}

export const goals = $state({
  loaded: false,
  weekly: {} as WeeklyRecord,
  milestones: [] as MilestoneState[]
});

/** Every skill's points right now, per course. */
export function pointsNow(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const course of app.courses) {
    const record = app.mastery[course.id];
    const skills: Record<string, number> = {};
    for (const skill of courseSkills(course)) {
      const p = skillPoints(record, skill.id);
      if (p > 0) skills[skill.id] = p;
    }
    out[course.id] = skills;
  }
  return out;
}

/** Rolls the week over when a new one has started, keeping last week's report. */
export async function syncWeek(): Promise<void> {
  const today = dayKey(new Date());
  const thisWeek = weekStart(today);
  let record: WeeklyRecord = {};
  try {
    record = (await storage.getRecord<WeeklyRecord>('weekly')) ?? {};
  } catch {
    /* storage blocked: work in memory */
  }
  if (record.current?.week !== thisWeek) {
    const now = pointsNow();
    if (record.current) record.lastReport = weekReport(record.current.week, app.activity, record.current, now);
    record.current = { week: thisWeek, points: now };
    try {
      await storage.saveRecord('weekly', JSON.parse(JSON.stringify(record)));
    } catch {
      /* not kept */
    }
  }
  goals.weekly = record;
  goals.loaded = true;
}

export async function dismissReport(week: string): Promise<void> {
  goals.weekly = { ...goals.weekly, dismissed: week };
  try {
    await storage.saveRecord('weekly', JSON.parse(JSON.stringify(goals.weekly)));
  } catch {
    /* not kept */
  }
}

/** This week so far. */
export function thisWeekReport(): WeekReport {
  const week = weekStart(dayKey(new Date()));
  return weekReport(week, app.activity, goals.weekly.current, pointsNow());
}

async function milestoneInput(): Promise<MilestoneInput> {
  let lessonsDone = 0;
  let skillsMastered = 0;
  let reviewsDone = 0;
  for (const course of app.courses) {
    lessonsDone += app.progress[course.id]?.completedLessons.length ?? 0;
    const record = app.mastery[course.id];
    for (const skill of courseSkills(course)) {
      if (isMasterable(skill) && tierForPoints(skillPoints(record, skill.id)) === 'mastered') skillsMastered += 1;
    }
    for (const card of Object.values(record?.cards ?? {})) reviewsDone += Math.max(0, card.reps - 1);
  }
  const correctAnswers = Object.values(app.activity).reduce((n, d) => n + d.correct, 0);
  let chessWins = 0;
  let bestBotBeaten = 0;
  let endgamesSolved = 0;
  try {
    const [games, chess] = await Promise.all([storage.listGames(), storage.getChess()]);
    for (const g of games) {
      if (g.result !== 'won') continue;
      chessWins += 1;
      bestBotBeaten = Math.max(bestBotBeaten, botById(g.botId)?.elo ?? 0);
    }
    endgamesSolved = ENDGAMES.filter((d) => chess.endgames[d.id]?.done).length;
  } catch {
    /* no chess data */
  }
  return {
    lessonsDone,
    skillsMastered,
    coursesDone: coursesCompleted(app.courses, app.mastery),
    correctAnswers,
    bestStreak: Math.max(longestStreak(app.activity), computeStats(app.activity, dayKey(new Date())).streak),
    reviewsDone,
    chessWins,
    bestBotBeaten,
    endgamesSolved
  };
}

/** Works out the milestones; newly earned ones get their date saved and a short celebration. */
export async function syncMilestones(announce = true): Promise<void> {
  let seen: Record<string, string> = {};
  try {
    seen = (await storage.getRecord<Record<string, string>>('milestones')) ?? {};
  } catch {
    /* in memory */
  }
  const now = new Date().toISOString();
  const { states, fresh } = milestoneStates(await milestoneInput(), seen, now);
  goals.milestones = states;
  // The very first look (an existing learner after an update) fills in quietly.
  const firstLook = !('_init' in seen);
  if (fresh.length === 0 && !firstLook) return;
  for (const id of fresh) seen[id] = now;
  if (firstLook) seen._init = now;
  try {
    await storage.saveRecord('milestones', seen);
  } catch {
    /* not kept */
  }
  if (announce && !firstLook && fresh.length > 0) {
    showToast(fresh.length === 1 ? t('milestone.new', { name: t('milestone.' + fresh[0] + '.name') }) : t('milestone.newMany', { n: fresh.length }), {
      actionLabel: t('milestone.see'),
      onAction: () => {
        location.hash = '#/stats';
      }
    });
  }
}
