// Reported questions: a learner flags a question that looks wrong while studying; later one
// prompt asks a chat AI to fix all of them, and the answer is imported back over the old ones.

import type { Block, Course, Question, QuestionReport } from './types.ts';
import { languageName } from './promptBuilder.ts';

export const REPORT_REASONS: readonly QuestionReport['reason'][] = ['wrong', 'unclear', 'typo', 'other'];

/** Every question of a course with where it lives, in course order. */
export function allQuestions(course: Course): { question: Question; where: string }[] {
  const out: { question: Question; where: string }[] = [];
  const add = (block: Block | undefined, where: string) => {
    for (const q of (Array.isArray(block?.questions) ? (block?.questions as Question[]) : [])) out.push({ question: q, where });
  };
  for (const m of course.modules) {
    for (const l of m.lessons) for (const b of l.blocks) add(b, `${m.title} / ${l.title}`);
    add(m.test, `${m.title} / test`);
  }
  add(course.finalExam, 'final exam');
  return out;
}

/** The reported questions of a course that still exist, with their reports. */
export function reportedQuestions(course: Course, reports: Record<string, QuestionReport> | undefined): { question: Question; where: string; report: QuestionReport }[] {
  if (!reports) return [];
  return allQuestions(course)
    .filter(({ question }) => reports[question.id])
    .map((entry) => ({ ...entry, report: reports[entry.question.id] as QuestionReport }));
}

const REASON_TEXT: Record<QuestionReport['reason'], string> = {
  wrong: 'the marked answer seems wrong',
  unclear: 'the question is unclear or has more than one right answer',
  typo: 'there is a typo or a language mistake',
  other: 'something else is wrong'
};

/** The prompt that asks a chat AI to fix the reported questions and send them back for import. */
export function fixQuestionsPrompt(course: Course, reported: ReturnType<typeof reportedQuestions>): string {
  const languages = (course.languages && course.languages.length > 0 ? course.languages : [course.language ?? 'en']).map(languageName).join(' and ');
  const items = reported
    .map(({ question, where, report }, i) => {
      const note = report.note?.trim() ? `\nMy note: ${report.note.trim()}` : '';
      return `### ${i + 1}. ${where}\nProblem: ${REASON_TEXT[report.reason]}.${note}\n\`\`\`json\n${JSON.stringify(question, null, 2)}\n\`\`\``;
    })
    .join('\n\n');
  return [
    `You are a careful subject expert. I study the course "${course.title}" and reported the questions below as faulty. Check each one yourself: solve it, compare with the marked answer, and read every text field.`,
    '## Rules',
    [
      '- Fix what is wrong. If a question is actually correct, keep it unchanged and say so.',
      '- Keep every "id", "kind" and "skillId" exactly as they are.',
      `- Keep the language of the content (${languages}), including every "i18n" translation; fix the same mistake in all languages.`,
      '- Keep the shape of each question: the same fields, valid for its kind.'
    ].join('\n'),
    '## The reported questions',
    items,
    '## Reply',
    `First one short line per question with what you changed. Then ONE \`\`\`json code block with exactly this shape and nothing else in it: {"courseId": "${course.id}", "questions": [ ...every corrected question, complete... ]}`
  ].join('\n\n');
}

/**
 * Puts corrected questions into a course, replacing the questions with the same id wherever they
 * are. Returns the new course, or the ids that were not found.
 */
export function replaceQuestions(course: Course, questions: readonly Question[]): { course: Course; missing: string[] } {
  const next = structuredClone(course);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const found = new Set<string>();
  const patch = (block: Block | undefined) => {
    if (!block || !Array.isArray(block.questions)) return;
    block.questions = (block.questions as Question[]).map((q) => {
      const fixed = byId.get(q.id);
      if (!fixed) return q;
      found.add(q.id);
      return structuredClone(fixed);
    });
  };
  for (const m of next.modules) {
    for (const l of m.lessons) for (const b of l.blocks) patch(b);
    patch(m.test);
  }
  patch(next.finalExam);
  return { course: next, missing: questions.map((q) => q.id).filter((id) => !found.has(id)) };
}
