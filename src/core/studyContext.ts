// The one place a study screen's block context is built. Every screen that shows questions (a
// lesson, a practice set, a review session, a course challenge) hands the same reads and writes to
// the blocks, so answers, mastery, cards and activity are always recorded the same way.

import {
  app,
  courseSettings,
  displayTitle,
  getCourse,
  moduleMasteryPercentFor,
  recordActivity,
  recordMasteryAttempt,
  updateProgress
} from './state.svelte.ts';
import { skillIndex, skillPoints, skillTitle } from './mastery.ts';
import type { BlockContext } from './types.ts';

export interface StudyItem {
  /** The flat item id: a lesson id, "<moduleId>:test", "final-exam", or a screen's own id. */
  lessonId: string;
  itemKind: 'lesson' | 'test' | 'exam';
  moduleId: string | null;
}

export interface StudyOptions {
  /** Host action for "Continue" at the end of a quiz set. */
  onSetContinue?: () => void;
  /** Count every answer as a test answer (a course challenge). */
  inTest?: boolean;
  /** Allow pasted video and image overrides (only the lesson player shows media). */
  media?: boolean;
  /** A practice set: questions start unanswered instead of showing the saved answers. */
  freshRun?: boolean;
}

export function studyContext(courseId: string, item: StudyItem, options: StudyOptions = {}): BlockContext {
  const course = getCourse(courseId);
  const questionSkills = course ? skillIndex(course) : new Map<string, string>();
  const media = options.media === true;
  // The course's own settings win over the app-wide ones.
  const settings = courseSettings(courseId);
  return {
    courseId,
    lessonId: item.lessonId,
    itemKind: item.itemKind,
    moduleId: item.moduleId,
    explanationLevel: settings.explanationLevel,
    explanationLanguage: settings.explanationLanguage,
    questionLanguage: settings.questionLanguage,
    autoplayVideo: settings.autoplayVideo,
    askConfidence: settings.askConfidence,
    recallFirst: settings.recallFirst,
    allowHints: settings.allowHints,
    acceptTypos: settings.acceptTypos,
    showWarmups: settings.showWarmups,
    sounds: settings.sounds,
    celebrations: settings.celebrations,
    courseTitle: course ? displayTitle(course) : courseId,
    getAnswer: (qid) => app.progress[courseId]?.answers[qid],
    recordAnswer: (qid, record) => {
      const wasCorrect = app.progress[courseId]?.answers[qid]?.correct === true;
      void updateProgress(courseId, (p) => {
        p.answers[qid] = record;
      });
      if (record.correct && !wasCorrect) void recordActivity('correct');
    },
    getVideoOverride: (bid) => (media ? app.progress[courseId]?.videoOverrides[bid] : undefined),
    setVideoOverride: (bid, url) => {
      if (!media) return;
      void updateProgress(courseId, (p) => {
        p.videoOverrides[bid] = url;
      });
    },
    getImageOverride: (bid) => (media ? app.progress[courseId]?.imageOverrides?.[bid] : undefined),
    setImageOverride: (bid, url) => {
      if (!media) return;
      void updateProgress(courseId, (p) => {
        p.imageOverrides ??= {};
        p.imageOverrides[bid] = url;
      });
    },
    skillIdFor: (qid) => questionSkills.get(qid) ?? item.lessonId,
    skillTitleFor: (sid) => (course ? skillTitle(course, sid) : sid),
    getSkillMastery: (sid) => app.mastery[courseId]?.skills[sid],
    getSkillPoints: (sid) => skillPoints(app.mastery[courseId], sid),
    recordMasteryAttempt: (attempt) =>
      recordMasteryAttempt(courseId, options.inTest ? { ...attempt, inTest: true } : attempt),
    getModuleMasteryPercent: (mid) => moduleMasteryPercentFor(courseId, mid),
    onSetContinue: options.onSetContinue,
    freshRun: options.freshRun === true
  };
}
