<script lang="ts">
  // A chess puzzle inside a quiz: the learner plays the moves, the opponent answers from the
  // solution line, and a wrong move is shown, then taken back so the learner can try again from
  // the same position. The quiz records every finished attempt through `onresult`.
  import { untrack } from 'svelte';
  import { Chess } from 'chess.js';
  import ChessBoard from './ChessBoard.svelte';
  import { judgeMove, legalTargets, puzzleLines, sideToMove, type BoardArrow as Arrow, type Color } from '../../core/chess.ts';
  import type { Question } from '../../core/types.ts';
  import { t } from '../../i18n/i18n.ts';

  let {
    question,
    hintLevel = 0,
    showSolution = false,
    done = false,
    onresult
  }: {
    question: Question;
    /** 1 marks the piece to move, 2 also draws the move. */
    hintLevel?: number;
    showSolution?: boolean;
    /** The quiz already counts this puzzle as solved (for example on a revisit). */
    done?: boolean;
    onresult: (moves: string[], correct: boolean) => void;
  } = $props();

  const start = untrack(() => question.fen ?? '');
  const learner: Color = sideToMove(start);
  const game = new Chess(start);

  let fen = $state(start);
  let played = $state<string[]>([]);
  let lastMove = $state<[string, string] | null>(null);
  let marks = $state<Record<string, 'good' | 'bad' | 'hint'>>({});
  let status = $state<'turn' | 'good' | 'wrong' | 'solved' | 'shown' | 'thinking'>('turn');
  let busy = $state(false);
  // A revisit of a puzzle that was already solved starts at the end of the line.
  let finished = $state(false);

  const lines = $derived(puzzleLines(question));
  const total = $derived(Math.ceil((lines[0]?.length ?? 1) / 2));
  const learnerMovesDone = $derived(Math.ceil(played.length / 2));
  const targets = $derived(busy || finished ? new Map<string, string[]>() : legalTargets(new Chess(fen)));

  /** The next move of the line the learner is on (main line first). */
  const expected = $derived.by(() => {
    const line = lines.find((l) => played.every((m, i) => l[i] === m));
    return line?.[played.length];
  });
  const hintMarks = $derived.by(() => {
    if (!expected || finished || busy || hintLevel < 1) return {};
    return { [expected.slice(0, 2)]: 'hint' as const };
  });
  const hintArrows = $derived<Arrow[]>(
    expected && !finished && !busy && hintLevel >= 2 ? [{ from: expected.slice(0, 2), to: expected.slice(2, 4), tone: 'hint' }] : []
  );

  function apply(uci: string): void {
    const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    fen = game.fen();
    lastMove = [move.from, move.to];
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function onmove(from: string, to: string, promotion?: string) {
    if (busy || finished) return;
    // Promote to a queen unless the line asks for something else.
    let uci = from + to + (promotion ?? '');
    const legal = game.moves({ verbose: true }).filter((m) => m.from === from && m.to === to);
    if (legal.length === 0) return;
    if (legal.some((m) => m.promotion) && !promotion) uci = from + to + 'q';
    const step = judgeMove(question, played, uci);
    busy = true;
    if (step.kind === 'wrong') {
      const before = fen;
      const beforeLast = lastMove;
      apply(uci);
      marks = { [from]: 'bad', [to]: 'bad' };
      status = 'wrong';
      onresult([...played, uci], false);
      await wait(900);
      game.undo();
      fen = before;
      lastMove = beforeLast;
      marks = {};
      busy = false;
      return;
    }
    apply(uci);
    played = [...played, uci];
    marks = { [to]: 'good' };
    if (step.kind === 'solved') {
      status = 'solved';
      finished = true;
      busy = false;
      onresult(played, true);
      return;
    }
    status = 'good';
    await wait(500);
    apply(step.reply);
    played = [...played, step.reply];
    marks = {};
    status = 'turn';
    busy = false;
  }

  // "Show the solution": play the rest of the main line, one move at a time.
  let solutionStarted = false;
  $effect(() => {
    if (!showSolution || solutionStarted) return;
    solutionStarted = true;
    untrack(() => void playSolution());
  });

  async function playSolution() {
    busy = true;
    const line = lines[0] ?? [];
    // Go back to where the learner left the line, if needed.
    while (played.length > 0 && !line.slice(0, played.length).every((m, i) => played[i] === m)) {
      game.undo();
      played = played.slice(0, -1);
    }
    fen = game.fen();
    for (let i = played.length; i < line.length; i += 1) {
      await wait(i === played.length ? 200 : 700);
      apply(line[i] as string);
      played = [...played, line[i] as string];
      marks = i % 2 === 0 ? { [(line[i] as string).slice(2, 4)]: 'good' } : {};
    }
    status = 'shown';
    finished = true;
    busy = false;
  }

  // A puzzle the learner already solved earlier is shown solved, at its final position.
  $effect(() => {
    if (!done || finished || played.length > 0) return;
    untrack(() => {
      const line = lines[0] ?? [];
      for (const m of line) apply(m);
      played = [...line];
      status = 'solved';
      finished = true;
    });
  });

  const lastMoveStart = $derived<[string, string] | null>(
    lastMove ?? (question.lastMove ? [question.lastMove.slice(0, 2), question.lastMove.slice(2, 4)] : null)
  );
  const side = $derived(t(learner === 'w' ? 'chess.white' : 'chess.black'));
</script>

<div class="cf-chess" data-testid="chess-puzzle" data-question={question.id}>
  <p class="cf-chess-status" class:good={status === 'good' || status === 'solved'} class:bad={status === 'wrong'} role="status">
    <span class="cf-turn" data-color={learner} aria-hidden="true"></span>
    {#if status === 'wrong'}
      {t('chess.wrong')}
    {:else if status === 'good'}
      {t('chess.goodMove')}
    {:else if status === 'solved'}
      {t('chess.solved')}
    {:else if status === 'shown'}
      {t('chess.solutionShown')}
    {:else if total > 1}
      {t('chess.toMoveOf', { side, n: learnerMovesDone + 1, total })}
    {:else}
      {t('chess.toMove', { side })}
    {/if}
  </p>
  <ChessBoard
    {fen}
    orientation={learner}
    movable={busy || finished ? null : learner}
    {targets}
    lastMove={lastMoveStart}
    marks={{ ...hintMarks, ...marks }}
    arrows={hintArrows}
    label={question.prompt}
    {onmove}
  />
  {#if question.source}
    <p class="cf-chess-source">{t('chess.source')} <a href={'https://' + question.source.replace(/^https?:\/\//, '')} target="_blank" rel="noopener noreferrer">{question.source.replace(/^https?:\/\//, '')}</a></p>
  {/if}
</div>
