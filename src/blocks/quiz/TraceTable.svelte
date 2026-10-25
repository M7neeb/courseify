<script lang="ts">
  // A trace table: the program is in the question, the table shows what every variable holds after
  // each step, and the learner fills the empty cells.
  import type { Question } from '../../core/types.ts';
  import { t } from '../../i18n/i18n.ts';

  let {
    question,
    values,
    disabled = false,
    reveal = false,
    wrong = false,
    onchange
  }: {
    question: Question;
    values: string[];
    disabled?: boolean;
    /** Show the right values in the empty cells. */
    reveal?: boolean;
    wrong?: boolean;
    onchange?: (index: number, value: string) => void;
  } = $props();

  const blanks = $derived(question.blanks ?? []);
  const blankAt = (r: number, c: number): number => blanks.findIndex(([br, bc]) => br === r && bc === c);
</script>

<div class="trace-wrap" role="group" aria-label={t('quiz.traceTable')}>
  <table class="trace-table">
    <thead>
      <tr>{#each question.columns ?? [] as c, ci (ci)}<th>{c}</th>{/each}</tr>
    </thead>
    <tbody>
      {#each question.rows ?? [] as row, ri (ri)}
        <tr>
          {#each row as cell, ci (ci)}
            {@const bi = blankAt(ri, ci)}
            <td>
              {#if bi < 0}
                {cell}
              {:else if reveal}
                <span class="trace-answer">{cell}</span>
              {:else}
                <input
                  type="text"
                  inputmode="text"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  class:bad={wrong && (values[bi] ?? '').trim() !== ''}
                  aria-label={t('quiz.traceCell', { row: ri + 1, column: question.columns?.[ci] ?? '' })}
                  value={values[bi] ?? ''}
                  {disabled}
                  oninput={(e) => onchange?.(bi, e.currentTarget.value)}
                />
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="muted small">{t('quiz.traceHint')}</p>
</div>
