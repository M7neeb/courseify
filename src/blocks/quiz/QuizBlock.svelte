<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { AnswerRecord, Block, BlockContext, Confidence, Question } from '../../core/types.ts';
  import { gradeWithTypos, hotspotHit, multiSelectOutcome, writtenCovered, writtenNeeded } from '../../core/grade.ts';
  import { guessCovered } from '../../core/reflect.ts';
  import HotspotPicture from './HotspotPicture.svelte';
  import ReportQuestion from './ReportQuestion.svelte';
  import CodeExercise from '../../ui/code/CodeExercise.svelte';
  import SqlExercise from '../../ui/sql/SqlExercise.svelte';
  import TraceTable from './TraceTable.svelte';
  import ShellExercise from '../../ui/shell/ShellExercise.svelte';
  import { renderMarkdown } from '../../core/markdown.ts';
  import { rationaleFor, resolveQuestions } from '../../core/localize.ts';
  import { TIER_ORDER, tierForPoints } from '../../core/mastery.ts';
  import { playCelebrate, playCorrect, playWrong } from '../../ui/sound.ts';
  import Celebrate from '../../ui/Celebrate.svelte';
  import { tutorPrompt } from '../../core/promptBuilder.ts';
  import { copyText } from '../../ui/clipboard.ts';
  import { formatLine } from '../../core/chess.ts';
  import ChessPuzzle from '../../ui/chess/ChessPuzzle.svelte';
  import { t } from '../../i18n/i18n.ts';

  let { block, ctx }: { block: Block; ctx: BlockContext } = $props();

  // Questions are resolved for the chosen question language before anything is rendered or graded.
  const questions = $derived(resolveQuestions(block, ctx.questionLanguage));
  const lang = $derived(typeof block.language === 'string' ? block.language : undefined);
  // A warm-up (pretest) quiz: guess before the lesson. One guess per question, the answer is shown
  // straight away, and nothing is saved - it never counts for mastery or review.
  const pretest = $derived(block.pretest === true);
  let localAnswers = $state<Record<string, AnswerRecord>>({});
  // A practice set, and practising mistakes, start every question fresh: the saved answers are
  // already right (you retry until you are), so the run keeps its own answers and still saves each.
  let runAnswers = $state<Record<string, AnswerRecord> | null>(untrack(() => (ctx.freshRun ? {} : null)));
  // Questions answered at least once in this set. Only the first answer can win back a missed one.
  const triedInSet = new Set<string>();
  function answerOf(id: string): AnswerRecord | undefined {
    if (pretest) return localAnswers[id];
    return runAnswers ? runAnswers[id] : ctx.getAnswer(id);
  }
  // "Why?" after a right concept answer: the learner's own words first, then the explanation.
  const WHY_KINDS = new Set(['multiple-choice', 'true-false', 'multi-select']);
  let whyText = $state<Record<string, string>>({});
  let whyDone = $state<Record<string, boolean>>({});
  const askWhy = (q: Question): boolean => ctx.askWhy !== false && !pretest && !exam && WHY_KINDS.has(q.kind) && !!q.explanation && whyDone[q.id] !== true;
  // "How sure are you?" per question, and which tutor prompt was just copied.
  let confidence = $state<Record<string, Confidence>>({});
  let tutorCopied = $state<string | null>(null);
  const CONFIDENCE: Confidence[] = ['sure', 'unsure', 'guess'];
  // Recall first: multiple-choice options stay hidden until the learner has thought of an answer.
  let revealed = $state<Record<string, boolean>>({});
  let recalled = $state<Record<string, string>>({});
  // A forgiven typo, keyed by question: the accepted spelling to show.
  let typoOf = $state<Record<string, string>>({});
  // Right answers in a row on the first try, for the small "in a row" counter.
  let inARow = $state(0);
  const hidden = $derived(pretest && ctx.showWarmups === false);
  // A timed mock exam: answers are saved without feedback and the results come at the end.
  const exam = $derived(ctx.examDeadline !== undefined && !pretest);
  let now = $state(Date.now());
  const secondsLeft = $derived(ctx.examDeadline !== undefined ? Math.max(0, Math.ceil((ctx.examDeadline - now) / 1000)) : 0);
  const timeLeft = $derived(`${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`);
  $effect(() => {
    if (!exam) return;
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  // Time is up: hand in whatever is answered.
  $effect(() => {
    if (exam && secondsLeft === 0 && !finished) untrack(() => handIn());
  });
  const hintsAllowed = $derived(ctx.allowHints !== false);
  function needsRecall(q: Question): boolean {
    return ctx.recallFirst === true && !pretest && (q.kind === 'multiple-choice' || q.kind === 'multi-select') && revealed[q.id] !== true;
  }

  // One question at a time. `drillIds` narrows the run to just the mistakes after a set is done.
  let drillIds = $state<string[] | null>(null);
  let drillRound = $state(0);
  const active = $derived.by(() => {
    const ids = drillIds;
    return ids ? questions.filter((q) => ids.includes(q.id)) : questions;
  });

  let index = $state(0);
  let drafts = $state<Record<string, unknown>>({});
  let texts = $state<Record<string, string>>({});
  let missed = $state<Record<string, boolean>>({});
  let hinted = $state<Record<string, boolean>>({});
  let hintShown = $state<Record<string, number>>({});
  let misses = $state<{ questionId: string; given: unknown }[]>([]);
  // Matching: questionId -> { leftIndex: canonical right index }. Ordering: questionId -> display order.
  let matches = $state<Record<string, Record<number, number>>>({});
  let orders = $state<Record<string, number[]>>({});
  // Written answers: the learner has moved on to ticking key points, and which ones are ticked.
  let selfCheck = $state<Record<string, boolean>>({});
  let ticks = $state<Record<string, number[]>>({});

  const current = $derived(active[index] as Question | undefined);
  const finished = $derived(active.length > 0 && index >= active.length);
  const currentRecord = $derived(current ? answerOf(current.id) : undefined);
  // In a warm-up any guess finishes the question; elsewhere you retry until you are right.
  const answeredCorrect = $derived(pretest ? currentRecord !== undefined : currentRecord?.correct === true);
  const showWrong = $derived(!pretest && currentRecord !== undefined && currentRecord.correct === false);
  const confidentMiss = $derived(showWrong && current !== undefined && confidence[current.id] === 'sure');
  const partialMulti = $derived(
    current !== undefined && current.kind === 'multi-select' && multiSelectOutcome(current, draftOf(current)) === 'partial'
  );
  const currentRationale = $derived(current && showWrong ? wrongRationale(current) : undefined);

  // Snapshot every skill's points once, on mount, so the results screen can show before -> after.
  let runSkills = $state<string[]>([]);
  let beforeSkills = $state<Record<string, number>>({});
  let captured = false;
  $effect(() => {
    if (captured) return;
    captured = true;
    untrack(() => {
      const ids: string[] = [];
      for (const q of questions) {
        const id = ctx.skillIdFor(q.id);
        if (!ids.includes(id)) ids.push(id);
      }
      const snapshot: Record<string, number> = {};
      for (const id of ids) snapshot[id] = pointsOf(id);
      runSkills = ids;
      beforeSkills = snapshot;
    });
  });

  const hintSteps = $derived(current ? stepsFor(current) : []);
  const hintStep = $derived(current ? (hintShown[current.id] ?? 0) : 0);
  const shownHints = $derived(hintSteps.slice(0, Math.min(hintStep, hintSteps.length)));
  const solutionShown = $derived(hintStep > hintSteps.length);

  const solvedFirstTry = $derived(active.filter((q) => answerOf(q.id)?.solvedOnFirstTry === true).length);
  const unanswered = $derived(active.filter((q) => answerOf(q.id) === undefined));
  /** German grade (1 best, 6 worst) for an exam score, on the common 100-point key. */
  function gradeOf(percent: number): number {
    if (percent >= 92) return 1;
    if (percent >= 81) return 2;
    if (percent >= 67) return 3;
    if (percent >= 50) return 4;
    if (percent >= 30) return 5;
    return 6;
  }
  const accuracy = $derived(active.length === 0 ? 0 : Math.round((solvedFirstTry / active.length) * 100));
  const deltas = $derived(
    runSkills.map((id) => ({
      skillId: id,
      title: ctx.skillTitleFor(id),
      before: beforeSkills[id] ?? 0,
      after: pointsOf(id)
    }))
  );
  const modulePercent = $derived(ctx.moduleId ? ctx.getModuleMasteryPercent(ctx.moduleId) : 0);
  // Skills that reached a new level of Familiar or higher in this set: worth celebrating.
  const levelUps = $derived(
    deltas.filter((d) => {
      const after = TIER_ORDER.indexOf(tierForPoints(d.after));
      return after > TIER_ORDER.indexOf(tierForPoints(d.before)) && after >= TIER_ORDER.indexOf('familiar');
    })
  );
  let celebrated = false;
  $effect(() => {
    if (finished && !pretest && levelUps.length > 0 && !celebrated) {
      celebrated = true;
      if (ctx.sounds && ctx.celebrations !== false) untrack(() => playCelebrate());
    }
  });
  const mistakeList = $derived(
    misses
      .map((m) => ({ question: active.find((q) => q.id === m.questionId), given: m.given }))
      .filter((m): m is { question: Question; given: unknown } => m.question !== undefined)
  );

  function pointsOf(skillId: string): number {
    return ctx.getSkillPoints ? ctx.getSkillPoints(skillId) : (ctx.getSkillMastery(skillId)?.points ?? 0);
  }

  function stepsFor(q: Question): string[] {
    if (Array.isArray(q.hints) && q.hints.length > 0) return q.hints;
    // A chess puzzle always has two hints: the piece to move, then the move itself on the board.
    if (q.kind === 'chess') return [q.hint ?? t('chess.hint1'), t('chess.hint2')];
    return q.hint ? [q.hint] : [];
  }

  /** Kinds answered by typing into one text field. */
  function isText(q: Question): boolean {
    return q.kind === 'short-answer' || q.kind === 'fill-blank' || q.kind === 'numeric';
  }

  /** Deterministic shuffle seeded by the question id, so a question looks the same every render. */
  function seededOrder(id: string, length: number, salt: string): number[] {
    const out = Array.from({ length }, (_, i) => i);
    if (length < 2) return out;
    let seed = 2166136261;
    const key = id + salt;
    for (let i = 0; i < key.length; i += 1) {
      seed ^= key.charCodeAt(i);
      seed = Math.imul(seed, 16777619);
    }
    let a = (seed >>> 0) || 1;
    const rnd = () => {
      a = (a + 0x6d2b79f5) | 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = out[i] as number;
      out[i] = out[j] as number;
      out[j] = tmp;
    }
    return out;
  }

  /** The learner's current order for an ordering question (canonical indexes), or the shuffled start. */
  function orderOf(q: Question): number[] {
    const saved = orders[q.id];
    if (saved) return saved;
    const o = seededOrder(q.id, q.items?.length ?? 0, ':order');
    // Never hand out the list already in the right order.
    return o.length > 1 && o.every((v, i) => v === i) ? [...o.slice(1), o[0] as number] : o;
  }

  /** The right-hand options shown for a matching question, as canonical indexes. */
  function rightOrder(q: Question): number[] {
    return seededOrder(q.id, q.pairs?.length ?? 0, ':right');
  }

  /** Trace tables: what the learner typed into the empty cells, in the order of `blanks`. */
  let traceVals = $state<Record<string, string[]>>({});

  /** The learner's selection as canonical right indexes, one per left (— 1 = not chosen yet). */
  function pairsGiven(q: Question): number[] {
    const chosen = matches[q.id] ?? {};
    return (q.pairs ?? []).map((_, left) => chosen[left] ?? -1);
  }

  function draftOf(q: Question): unknown {
    if (isText(q)) return texts[q.id];
    if (q.kind === 'written') return { text: texts[q.id] ?? '', covered: ticks[q.id] ?? [] };
    if (q.kind === 'matching') return pairsGiven(q);
    if (q.kind === 'ordering') return orderOf(q);
    if (q.kind === 'trace') return (q.blanks ?? []).map((_, i) => traceVals[q.id]?.[i] ?? '');
    return drafts[q.id];
  }

  function canCheck(q: Question): boolean {
    const d = draftOf(q);
    if (isText(q)) return typeof d === 'string' && d.trim() !== '';
    if (q.kind === 'multi-select') return Array.isArray(d) && d.length > 0;
    if (q.kind === 'matching') {
      const pairs = q.pairs?.length ?? 0;
      return pairs > 0 && pairsGiven(q).every((right) => right >= 0);
    }
    if (q.kind === 'ordering') return (q.items?.length ?? 0) >= 2;
    if (q.kind === 'trace') return Array.isArray(d) && d.length > 0 && d.every((v) => typeof v === 'string' && v.trim() !== '');
    // A puzzle checks itself when a move is played; code checks itself with its tests.
    if (q.kind === 'chess' || q.kind === 'code' || q.kind === 'sql' || q.kind === 'shell') return false;
    if (q.kind === 'written') return (texts[q.id] ?? '').trim() !== '';
    return d !== undefined;
  }

  function toggleMulti(q: Question, option: number) {
    const selected = new Set<number>(Array.isArray(drafts[q.id]) ? (drafts[q.id] as number[]) : []);
    if (selected.has(option)) selected.delete(option);
    else selected.add(option);
    drafts[q.id] = [...selected].sort((a, b) => a - b);
  }

  function setMatch(q: Question, left: number, raw: string) {
    const right = Number(raw);
    if (!Number.isInteger(right)) return;
    matches[q.id] = { ...(matches[q.id] ?? {}), [left]: right };
  }

  function moveOrder(q: Question, position: number, delta: number) {
    const order = [...orderOf(q)];
    const target = position + delta;
    if (target < 0 || target >= order.length) return;
    const a = order[position] as number;
    order[position] = order[target] as number;
    order[target] = a;
    orders[q.id] = order;
  }

  /** The rationale for whatever wrong choice the learner made, if the question carries one. */
  function wrongRationale(q: Question): string | undefined {
    if (q.kind === 'multiple-choice') {
      const picked = drafts[q.id];
      return typeof picked === 'number' ? rationaleFor(q, picked) : undefined;
    }
    if (q.kind === 'multi-select') {
      const selected = Array.isArray(drafts[q.id]) ? (drafts[q.id] as number[]) : [];
      const correct = new Set(Array.isArray(q.answer) ? q.answer.filter((v) => typeof v === 'number') : []);
      for (const option of selected) {
        if (!correct.has(option)) {
          const text = rationaleFor(q, option);
          if (text) return text;
        }
      }
    }
    return undefined;
  }

  function givenText(q: Question, given: unknown): string {
    if (q.kind === 'multiple-choice') return q.options?.[given as number] ?? '';
    if (q.kind === 'true-false') return given ? t('quiz.true') : t('quiz.false');
    if (q.kind === 'multi-select') {
      const selected = Array.isArray(given) ? (given as number[]) : [];
      return selected.map((i) => q.options?.[i] ?? '').join(', ');
    }
    if (q.kind === 'matching') {
      const chosen = Array.isArray(given) ? (given as number[]) : [];
      return (q.pairs ?? [])
        .map((pair, left) => `${pair.left} → ${q.pairs?.[chosen[left] ?? -1]?.right ?? '—'}`)
        .join('; ');
    }
    if (q.kind === 'ordering') {
      const order = Array.isArray(given) ? (given as number[]) : [];
      return order.map((i) => q.items?.[i] ?? '').join(' → ');
    }
    if (q.kind === 'chess') return Array.isArray(given) && q.fen ? formatLine(q.fen, given as string[]) : '';
    if (q.kind === 'trace') return Array.isArray(given) ? (given as string[]).join(', ') : '';
    if (q.kind === 'code' || q.kind === 'sql' || q.kind === 'shell') {
      const code = typeof given === 'object' && given !== null ? String((given as { code?: unknown }).code ?? '') : '';
      return code.length > 300 ? code.slice(0, 300) + '…' : code;
    }
    if (q.kind === 'written') {
      const text = typeof given === 'object' && given !== null ? String((given as { text?: unknown }).text ?? '') : '';
      return `${text} (${t('quiz.writtenCovered', { have: writtenCovered(q, given).length, total: q.points?.length ?? 0 })})`;
    }
    if (q.kind === 'hotspot') {
      const p = given as { x?: number; y?: number } | undefined;
      const hit = p && typeof p.x === 'number' && typeof p.y === 'number' ? hotspotHit(q.areas, p.x, p.y) : -1;
      return q.areas?.[hit]?.label ?? t('quiz.hotspotSpot');
    }
    return String(given ?? '');
  }

  function answerText(q: Question): string {
    if (q.kind === 'multiple-choice') return q.options?.[q.answer as number] ?? '';
    if (q.kind === 'true-false') return q.answer ? t('quiz.true') : t('quiz.false');
    if (q.kind === 'multi-select') {
      const correct = Array.isArray(q.answer) ? (q.answer as number[]) : [];
      return correct.map((i) => q.options?.[i] ?? '').join(', ');
    }
    if (q.kind === 'matching') return (q.pairs ?? []).map((pair) => `${pair.left} → ${pair.right}`).join('; ');
    if (q.kind === 'ordering') return (q.items ?? []).join(' → ');
    if (q.kind === 'chess') return q.fen && q.solution ? formatLine(q.fen, q.solution) : '';
    if (q.kind === 'hotspot') return q.areas?.[q.answer as number]?.label ?? t('quiz.hotspotMarked');
    if (q.kind === 'code') return typeof q.answer === 'string' ? q.answer : t('code.allTests');
    if (q.kind === 'sql') return typeof q.answer === 'string' ? q.answer : '';
    if (q.kind === 'trace') return (q.blanks ?? []).map(([r, c]) => q.rows?.[r]?.[c] ?? '').join(', ');
    if (q.kind === 'shell') return typeof q.answer === 'string' ? q.answer : '';
    if (Array.isArray(q.answer)) return String(q.answer[0] ?? '');
    return String(q.answer ?? '');
  }

  /** Grades the current draft. A wrong answer never advances: it stays open for another try. */
  /** The last wrong answer checked per question: checking it again unchanged is not a new attempt. */
  const lastWrong: Record<string, string> = {};

  function check(q: Question) {
    const given = draftOf(q);
    const key = JSON.stringify(given ?? null);
    if (lastWrong[q.id] === key) return;
    const result = gradeWithTypos(q, given, ctx.acceptTypos === true);
    const correct = result.correct;
    if (correct) delete lastWrong[q.id];
    else lastWrong[q.id] = key;
    if (result.typoOf) typoOf[q.id] = result.typoOf;
    const previous = answerOf(q.id);
    const usedHint = hinted[q.id] === true;
    // First try means: correct, no hint, and no earlier wrong attempt on this question.
    const firstTry = (previous?.solvedOnFirstTry ?? true) && correct && !usedHint && missed[q.id] !== true;
    const record: AnswerRecord = {
      given,
      correct,
      at: new Date().toISOString(),
      attempts: (previous?.attempts ?? 0) + 1,
      solvedOnFirstTry: firstTry
    };

    if (pretest) {
      localAnswers[q.id] = record;
      return;
    }
    if (runAnswers) {
      runAnswers[q.id] = record;
      const saved = ctx.getAnswer(q.id);
      ctx.recordAnswer(q.id, {
        ...record,
        attempts: (saved?.attempts ?? 0) + 1,
        solvedOnFirstTry: (saved?.solvedOnFirstTry ?? true) && firstTry
      });
    } else {
      ctx.recordAnswer(q.id, record);
    }
    if (ctx.sounds) (correct ? playCorrect : playWrong)();
    inARow = firstTry ? inARow + 1 : correct ? inARow : 0;
    const freshTry = !triedInSet.has(q.id);
    triedInSet.add(q.id);
    ctx.recordMasteryAttempt({ questionId: q.id, correct, usedHint, given, confidence: confidence[q.id], freshTry });

    if (!correct) {
      missed[q.id] = true;
      const existing = misses.find((m) => m.questionId === q.id);
      misses = existing
        ? misses.map((m) => (m.questionId === q.id ? { questionId: q.id, given } : m))
        : [...misses, { questionId: q.id, given }];
    }
    // In an exam the answer is just saved: no feedback, straight on to the next question.
    if (exam) advance();
  }

  /** In an exam a written answer is marked by the key points its words cover; no model answer is shown. */
  function saveWrittenInExam(q: Question) {
    ticks[q.id] = guessCovered(texts[q.id] ?? '', q.points ?? []);
    check(q);
  }

  /** Ends the exam now: unanswered questions count as missed. */
  function handIn() {
    index = active.length;
    void toQuestion();
  }

  /** Written answer, step one: show the model answer and the key points, with a first guess ticked. */
  function startSelfCheck(q: Question) {
    selfCheck[q.id] = true;
    ticks[q.id] = guessCovered(texts[q.id] ?? '', q.points ?? []);
  }

  function toggleTick(q: Question, point: number) {
    const set = new Set(ticks[q.id] ?? []);
    if (set.has(point)) set.delete(point);
    else set.add(point);
    ticks[q.id] = [...set].sort((a, b) => a - b);
  }

  /** A code check: the code and whether every test passed count as the answer. */
  function codeResult(q: Question, code: string, passed: boolean) {
    drafts[q.id] = { code, passed };
    check(q);
  }

  /** A finished puzzle attempt: the moves count as the answer and are graded like any other. */
  function chessResult(q: Question, moves: string[]) {
    drafts[q.id] = moves;
    check(q);
  }

  async function askTutor(q: Question) {
    const record = answerOf(q.id);
    const given = record && record.correct === false ? givenText(q, record.given) : undefined;
    const prompt = q.kind === 'chess' && q.fen ? `${q.prompt}\n\nPosition (FEN): ${q.fen}` : q.prompt;
    const text = tutorPrompt(ctx.courseTitle ?? '', { prompt, options: q.options }, ctx.questionLanguage, given);
    if (await copyText(text)) tutorCopied = q.id;
  }

  function nextHint(q: Question) {
    hinted[q.id] = true;
    hintShown[q.id] = (hintShown[q.id] ?? 0) + 1;
  }

  // The quiz's own top, so moving on scrolls to the next question, not to the top of the page.
  let root = $state<HTMLElement | undefined>();
  async function toQuestion() {
    await tick();
    if (!root) return;
    // Just under the sticky header, whatever its height (it grows by the notch on a phone).
    const header = document.querySelector('.cf-header')?.getBoundingClientRect().bottom ?? 0;
    window.scrollBy({ top: root.getBoundingClientRect().top - Math.max(0, header) - 12 });
  }

  function advance() {
    index += 1;
    void toQuestion();
  }

  function practiseMistakes() {
    const ids = [...new Set(misses.map((m) => m.questionId))];
    // Clear what was typed, picked or hinted on these questions, so each one is a real second try.
    for (const id of ids) {
      delete drafts[id];
      delete texts[id];
      delete missed[id];
      delete hinted[id];
      delete hintShown[id];
      delete matches[id];
      delete orders[id];
      delete revealed[id];
      delete recalled[id];
      delete confidence[id];
      delete typoOf[id];
      delete selfCheck[id];
      delete ticks[id];
    }
    runAnswers = {};
    misses = [];
    inARow = 0;
    drillIds = ids;
    drillRound += 1;
    index = 0;
    void toQuestion();
  }

  function continueOn() {
    ctx.onSetContinue?.();
  }

</script>

<section class="block quiz" {lang} bind:this={root}>
  {#if hidden}
    <!-- Warm-ups are switched off in Settings. -->
  {:else if finished && pretest}
    <div class="quiz-results warmup-done" role="status">
      <p class="results-kicker">{t('quiz.warmup')}</p>
      <p>{t('quiz.warmupDone')}</p>
    </div>
  {:else if finished}
    <div class="quiz-results" role="region" aria-label={t('results.title')}>
      {#if ctx.celebrations !== false && levelUps.length > 0}
        {@const top = levelUps[0]}
        <Celebrate message={levelUps.length === 1 && top ? t('results.levelUp', { skill: top.title, tier: t('mastery.tier.' + tierForPoints(top.after)) }) : t('results.levelUps', { n: levelUps.length })} />
      {/if}
      <p class="results-kicker">{t('results.title')}</p>
      <p class="results-score">{t('results.firstTry', { correct: solvedFirstTry, total: active.length })}</p>
      <p class="results-accuracy muted">{t('results.accuracy', { percent: accuracy })}</p>

      {#if ctx.moduleId}
        <div
          class="mastery-bar"
          role="progressbar"
          aria-valuenow={modulePercent}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label={t('mastery.moduleBar')}
        >
          <span class="mastery-fill" style:width={modulePercent + '%'}></span>
        </div>
        <p class="muted small">{t('mastery.moduleBar')}: {modulePercent}%</p>
      {/if}

      {#if deltas.length > 0}
        <h3>{t('results.masteryChange')}</h3>
        <ul class="skill-deltas">
          {#each deltas as d (d.skillId)}
            <li>
              <span class="skill-name">{d.title}</span>
              <span class="skill-tier muted small">{t('mastery.tier.' + tierForPoints(d.after))}</span>
              <span class="skill-points">
                {d.before} → {d.after}
                {#if d.after !== d.before}
                  <span class="delta" class:up={d.after > d.before} class:down={d.after < d.before}>
                    {d.after > d.before ? '+' : ''}{d.after - d.before}
                  </span>
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      {/if}

      {#if exam}
        <div class="exam-result">
          <p class="exam-grade">{t('exam.grade', { grade: gradeOf(accuracy) })}</p>
          <p class="muted small">{t('exam.gradeKey')}</p>
          {#if unanswered.length > 0}<p>{t('exam.unanswered', { n: unanswered.length })}</p>{/if}
        </div>
      {/if}

      {#if exam && unanswered.length > 0}
        <h3>{t('exam.notAnswered')}</h3>
        <ol class="results-mistakes">
          {#each unanswered as q (q.id)}
            <li>
              <p class="mistake-prompt">{q.prompt}</p>
              <p class="mistake-correct">{t('quiz.correctAnswer', { answer: answerText(q) })}</p>
              {#if q.explanation}<p class="mistake-explanation">{q.explanation}</p>{/if}
            </li>
          {/each}
        </ol>
      {/if}

      {#if mistakeList.length > 0}
        <h3>{t('results.mistakes')}</h3>
        <ol class="results-mistakes">
          {#each mistakeList as m, mi (mi)}
            <li>
              <p class="mistake-prompt">{m.question.prompt}</p>
              <p class="mistake-given">{t('quiz.yourAnswer')}: {givenText(m.question, m.given)}</p>
              <p class="mistake-correct">{t('quiz.correctAnswer', { answer: answerText(m.question) })}</p>
              {#if m.question.explanation}<p class="mistake-explanation">{m.question.explanation}</p>{/if}
            </li>
          {/each}
        </ol>
      {/if}

      <div class="row results-actions">
        {#if mistakeList.length > 0 && !exam}
          <button type="button" class="btn" onclick={practiseMistakes}>{t('results.practiseMistakes')}</button>
        {/if}
        <button type="button" class="btn primary" onclick={continueOn}>{t('results.continue')}</button>
      </div>
    </div>
  {:else if current}
    {#if pretest}
      <p class="warmup-label"><strong>{t('quiz.warmup')}</strong> <span class="muted">{t('quiz.warmupIntro')}</span></p>
    {/if}
    <p class="quiz-progress muted small">
      {t('quiz.questionOf', { current: index + 1, total: active.length })}
      {#if exam}
        <span class="exam-clock" class:low={secondsLeft <= 60} role="timer" aria-label={t('exam.timeLeftLabel', { time: timeLeft })}>{t('exam.timeLeft', { time: timeLeft })}</span>
      {:else}
        {#if inARow >= 3}<span class="in-a-row">{t('quiz.inARow', { n: inARow })}</span>{/if}
        <span class="quiz-running-score">
          {t('quiz.score', { correct: active.filter((q) => answerOf(q.id)?.correct).length, total: active.length })}
        </span>
      {/if}
    </p>

    <article class="question" data-state={answeredCorrect ? 'right' : showWrong ? 'wrong' : 'open'}>
      <div class="prose question-prompt">{@html renderMarkdown(current.prompt)}</div>
      {#if current.kind === 'chess'}
        {#key current.id + ':' + drillRound}
          <ChessPuzzle
            question={current}
            hintLevel={hintsAllowed ? hintStep : 0}
            showSolution={solutionShown}
            done={answeredCorrect}
            onresult={(moves) => chessResult(current, moves)}
          />
        {/key}
      {/if}
      {#if current.kind === 'code'}
        {#key current.id + ':' + drillRound}
          <CodeExercise question={current} done={answeredCorrect} showSolution={solutionShown} onresult={(code, passed) => codeResult(current, code, passed)} />
        {/key}
      {/if}
      {#if current.kind === 'shell'}
        {#key current.id + ':' + drillRound}
          <ShellExercise question={current} done={answeredCorrect} showSolution={solutionShown} onresult={(code, passed) => codeResult(current, code, passed)} />
        {/key}
      {/if}
      {#if current.kind === 'trace'}
        {#key current.id + ':' + drillRound}
          <TraceTable
            question={current}
            values={(current.blanks ?? []).map((_, i) => traceVals[current.id]?.[i] ?? '')}
            disabled={answeredCorrect}
            reveal={answeredCorrect || solutionShown}
            wrong={showWrong}
            onchange={(i, v) => {
              const next = [...(traceVals[current.id] ?? [])];
              next[i] = v;
              traceVals[current.id] = next;
            }}
          />
        {/key}
      {/if}
      {#if current.kind === 'sql'}
        {#key current.id + ':' + drillRound}
          <SqlExercise question={current} done={answeredCorrect} showSolution={solutionShown} onresult={(code, passed) => codeResult(current, code, passed)} />
        {/key}
      {/if}
      {#if current.kind === 'hotspot'}
        <HotspotPicture
          question={current}
          picked={drafts[current.id] as { x: number; y: number } | undefined}
          reveal={answeredCorrect || solutionShown}
          wrong={showWrong}
          disabled={answeredCorrect}
          onpick={(x, y) => (drafts[current.id] = { x, y })}
        />
      {/if}

      {#if !answeredCorrect}
        {#if showWrong}
          <p class="encourage" role="status">
            {#if current.kind === 'written'}
              {t('quiz.writtenShort', { have: writtenCovered(current, draftOf(current)).length, need: writtenNeeded(current) })}
            {:else}
              {partialMulti ? t('quiz.partial') : t('quiz.tryAgain')}
            {/if}
          </p>
          {#if currentRationale}
            <p class="rationale" role="status">
              <span class="rationale-label">{t('quiz.rationale')}:</span>
              {currentRationale}
            </p>
          {/if}
          {#if confidentMiss}
            <p class="confident-miss" role="status">{t('quiz.confidentMiss')}</p>
          {/if}
        {/if}

        {#if needsRecall(current)}
          <div class="recall-first">
            <p class="muted small">{t('quiz.recallFirst')}</p>
            <label class="sr-only" for={'r-' + current.id}>{t('quiz.recallLabel')}</label>
            <textarea id={'r-' + current.id} rows="2" placeholder={t('quiz.recallPlaceholder')} bind:value={recalled[current.id]}></textarea>
            <button type="button" class="btn primary" onclick={() => (revealed[current.id] = true)}>{t('quiz.showOptions')}</button>
          </div>
        {:else if current.kind === 'chess' || current.kind === 'hotspot' || current.kind === 'code' || current.kind === 'sql' || current.kind === 'trace' || current.kind === 'shell'}
          <!-- The board, the picture or the code above is the answer. -->
        {:else if current.kind === 'written'}
          <label class="sr-only" for={'w-' + current.id}>{t('quiz.yourAnswer')}</label>
          <textarea id={'w-' + current.id} class="written-input" rows="6" placeholder={t('quiz.writtenPlaceholder')} bind:value={texts[current.id]}></textarea>
          {#if selfCheck[current.id]}
            <div class="written-check">
              <p class="written-check-title">{t('quiz.writtenModel')}</p>
              <div class="prose written-model">{@html renderMarkdown(String(current.answer ?? ''))}</div>
              <p class="written-check-title">{t('quiz.writtenTick', { need: writtenNeeded(current), total: current.points?.length ?? 0 })}</p>
              <ul class="written-points">
                {#each current.points ?? [] as point, pi (pi)}
                  <li>
                    <label class="written-point">
                      <input type="checkbox" checked={(ticks[current.id] ?? []).includes(pi)} onchange={() => toggleTick(current, pi)} />
                      <span>{point}</span>
                    </label>
                  </li>
                {/each}
              </ul>
              <p class="muted small">{t('quiz.writtenHonest')}</p>
            </div>
          {/if}
        {:else if current.kind === 'multiple-choice'}
          <div class="options" role="radiogroup" aria-label={current.prompt}>
            {#each current.options ?? [] as option, oi (oi)}
              <button
                type="button"
                class="option"
                role="radio"
                aria-checked={drafts[current.id] === oi}
                class:selected={drafts[current.id] === oi}
                onclick={() => (drafts[current.id] = oi)}>{option}</button
              >
            {/each}
          </div>
        {:else if current.kind === 'true-false'}
          <div class="options row" role="radiogroup" aria-label={current.prompt}>
            {#each [true, false] as value (value)}
              <button
                type="button"
                class="option"
                role="radio"
                aria-checked={drafts[current.id] === value}
                class:selected={drafts[current.id] === value}
                onclick={() => (drafts[current.id] = value)}>{value ? t('quiz.true') : t('quiz.false')}</button
              >
            {/each}
          </div>
        {:else if current.kind === 'multi-select'}
          <p class="muted small">{t('quiz.selectAll')}</p>
          <div class="options" role="group" aria-label={current.prompt}>
            {#each current.options ?? [] as option, oi (oi)}
              {@const selected = Array.isArray(drafts[current.id]) && (drafts[current.id] as number[]).includes(oi)}
              <button
                type="button"
                class="option"
                role="checkbox"
                aria-checked={selected}
                class:selected
                onclick={() => toggleMulti(current, oi)}
              >
                <span class="check-box" aria-hidden="true">{selected ? '✓' : ''}</span>
                {option}
              </button>
            {/each}
          </div>
        {:else if current.kind === 'matching'}
          <p class="muted small">{t('quiz.matchPrompt')}</p>
          <ul class="matching">
            {#each current.pairs ?? [] as pair, li (li)}
              <li class="match-row">
                <span class="match-left">{pair.left}</span>
                <select
                  class="match-select"
                  aria-label={pair.left}
                  value={matches[current.id]?.[li] ?? ''}
                  onchange={(event) => setMatch(current, li, event.currentTarget.value)}
                >
                  <option value="" disabled>{t('quiz.choose')}</option>
                  {#each rightOrder(current) as ri (ri)}
                    <option value={ri}>{current.pairs?.[ri]?.right ?? ''}</option>
                  {/each}
                </select>
              </li>
            {/each}
          </ul>
        {:else if current.kind === 'ordering'}
          <p class="muted small">{t('quiz.orderPrompt')}</p>
          <ol class="ordering">
            {#each orderOf(current) as itemIndex, position (itemIndex)}
              <li class="order-row">
                <span class="order-text">{current.items?.[itemIndex] ?? ''}</span>
                <span class="order-controls">
                  <button
                    type="button"
                    class="icon-btn"
                    aria-label={t('quiz.moveUp')}
                    disabled={position === 0}
                    onclick={() => moveOrder(current, position, -1)}>↑</button
                  >
                  <button
                    type="button"
                    class="icon-btn"
                    aria-label={t('quiz.moveDown')}
                    disabled={position === (current.items?.length ?? 0) - 1}
                    onclick={() => moveOrder(current, position, 1)}>↓</button
                  >
                </span>
              </li>
            {/each}
          </ol>
        {:else}
          <label class="sr-only" for={'a-' + current.id}>{t('quiz.yourAnswer')}</label>
          <input
            id={'a-' + current.id}
            type="text"
            inputmode={current.kind === 'numeric' ? 'decimal' : 'text'}
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder={t('quiz.yourAnswer')}
            bind:value={texts[current.id]}
            onkeydown={(e) => e.key === 'Enter' && canCheck(current) && check(current)}
          />
        {/if}

        {#if ctx.askConfidence && !pretest && !needsRecall(current)}
          <div class="confidence" role="radiogroup" aria-label={t('quiz.howSure')}>
            <span class="confidence-label muted small">{t('quiz.howSure')}</span>
            {#each CONFIDENCE as level (level)}
              <button
                type="button"
                class="confidence-option"
                role="radio"
                aria-checked={confidence[current.id] === level}
                class:selected={confidence[current.id] === level}
                onclick={() => (confidence[current.id] = level)}>{t('quiz.confidence.' + level)}</button
              >
            {/each}
          </div>
        {/if}

        {#if shownHints.length > 0}
          <ol class="hint-list">
            {#each shownHints as hint, hi (hi)}<li class="hint">{hint}</li>{/each}
          </ol>
        {/if}
        {#if !pretest && hintsAllowed && !needsRecall(current)}
          {#if solutionShown}
            <p class="hint full-solution">{t('quiz.correctAnswer', { answer: answerText(current) })}</p>
          {:else}
            <div class="help-row">
              <button type="button" class="btn quiet-btn hint-btn" onclick={() => nextHint(current)}>
                {hintStep < hintSteps.length ? t('quiz.getHint') : t('quiz.fullSolution')}
              </button>
              <button type="button" class="btn quiet-btn tutor-btn" title={t('quiz.tutorHint')} onclick={() => askTutor(current)}>
                {tutorCopied === current.id ? t('quiz.tutorCopied') : t('quiz.tutor')}
              </button>
            </div>
          {/if}
        {/if}

      {:else if currentRecord}
        <div class="result" role="status">
          {#if currentRecord.correct}
            <p class="verdict"><span class="celebrate" aria-hidden="true">✓</span>{t('quiz.correct')}</p>
          {:else}
            <p class="verdict guess">{t('quiz.guessWrong')}</p>
          {/if}
          <p class="given">{t('quiz.yourAnswer')}: {givenText(current, currentRecord.given)}</p>
          {#if typoOf[current.id]}<p class="typo-note">{t('quiz.typo', { answer: typoOf[current.id] ?? '' })}</p>{/if}
          {#if recalled[current.id]?.trim()}<p class="given muted">{t('quiz.youRecalled', { text: recalled[current.id]?.trim() ?? '' })}</p>{/if}
          {#if !currentRecord.correct}<p class="given">{t('quiz.correctAnswer', { answer: answerText(current) })}</p>{/if}
          {#if current.explanation}
            {#if currentRecord.correct && askWhy(current)}
              <div class="why-card">
                <label for={`why-${current.id}`}>{t('quiz.whyPrompt')}</label>
                <textarea id={`why-${current.id}`} rows="2" placeholder={t('quiz.whyPlaceholder')} bind:value={whyText[current.id]}></textarea>
                <button type="button" class="btn" onclick={() => (whyDone[current.id] = true)}>{t('quiz.whyShow')}</button>
              </div>
            {:else}
              {#if whyText[current.id]?.trim()}<p class="given muted">{t('quiz.youExplained', { text: whyText[current.id]?.trim() ?? '' })}</p>{/if}
              <p class="explanation">{current.explanation}</p>
            {/if}
          {/if}
          <div class="row">
            <button type="button" class="btn primary" onclick={advance}>
              {index + 1 < active.length ? t('quiz.nextQuestion') : t('results.seeResults')}
            </button>
          </div>
        </div>
      {/if}

    </article>
    {#if !pretest && !exam}
      {#key current.id}<ReportQuestion {ctx} questionId={current.id} />{/key}
    {/if}

    <div class="quiz-bar">
      <div class="quiz-bar-left">
        <span class="quiz-bar-count">{t('quiz.positionOf', { current: index + 1, total: active.length })}</span>
        <span class="quiz-dots" aria-hidden="true">
          {#each active as q, i (i)}
            <span class="quiz-dot" class:done={exam ? answerOf(q.id) !== undefined : answerOf(q.id)?.correct === true} class:current={i === index}></span>
          {/each}
        </span>
      </div>
      <div class="quiz-bar-right">
        {#if exam}
          <button type="button" class="btn quiet-btn" onclick={handIn}>{t('exam.handIn')}</button>
        {/if}
        <button type="button" class="btn quiet-btn" onclick={advance}>{t('quiz.skip')}</button>
        {#if current.kind === 'written' && exam}
          <button type="button" class="btn primary" disabled={!canCheck(current)} onclick={() => saveWrittenInExam(current)}>
            {t('exam.save')}
          </button>
        {:else if current.kind === 'written' && !answeredCorrect && !selfCheck[current.id]}
          <button type="button" class="btn primary" disabled={!canCheck(current)} onclick={() => startSelfCheck(current)}>
            {t('quiz.writtenCompare')}
          </button>
        {:else if current.kind !== 'chess' && current.kind !== 'code' && current.kind !== 'sql' && current.kind !== 'shell'}
          <button type="button" class="btn primary" disabled={!canCheck(current)} onclick={() => check(current)}>
            {current.kind === 'written' ? t('quiz.writtenGrade') : t('quiz.check')}
          </button>
        {:else if answeredCorrect}
          <button type="button" class="btn primary" onclick={advance}>
            {index + 1 < active.length ? t('quiz.nextQuestion') : t('results.seeResults')}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</section>
