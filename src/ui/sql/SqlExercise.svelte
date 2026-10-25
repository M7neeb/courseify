<script lang="ts">
  // A SQL question: a small practice database, a query editor, Run to see the result table and
  // Check to compare it with the model answer's table. A matching table answers the question.
  import { onMount, untrack } from 'svelte';
  import CodeEditor from '../code/CodeEditor.svelte';
  import { checkSql, loadSchema, runSql, type SchemaTable, type SqlCheck } from './runner.ts';
  import type { SqlTable } from '../../core/sqlCompare.ts';
  import type { Question } from '../../core/types.ts';
  import { t } from '../../i18n/i18n.ts';

  let {
    question,
    done = false,
    showSolution = false,
    onresult
  }: {
    question: Question;
    done?: boolean;
    showSolution?: boolean;
    onresult?: (code: string, passed: boolean) => void;
  } = $props();

  const setup = $derived(question.setup ?? '');
  const reference = $derived(typeof question.answer === 'string' ? question.answer : '');
  const starter = untrack(() => question.starter ?? '');

  let sql = $state(starter);
  let schema = $state<SchemaTable[]>([]);
  let busy = $state<'run' | 'check' | null>(null);
  let table = $state<SqlTable | null>(null);
  let error = $state('');
  let timedOut = $state(false);
  let verdict = $state<SqlCheck['verdict']>();

  onMount(() => {
    void loadSchema(setup).then((s) => (schema = s));
  });

  function apply(r: { table?: SqlTable; error?: string; timedOut?: boolean }) {
    table = r.table ?? null;
    error = r.error ?? '';
    timedOut = r.timedOut === true;
  }

  async function run() {
    if (busy) return;
    busy = 'run';
    verdict = undefined;
    apply(await runSql(setup, sql));
    busy = null;
  }

  async function check() {
    if (busy) return;
    busy = 'check';
    const r = await checkSql(setup, sql, reference, question.ordered === true);
    apply(r);
    verdict = r.verdict;
    busy = null;
    if (r.verdict) onresult?.(sql, r.verdict.same);
  }
</script>

<div class="sql-ex">
  {#if schema.length > 0}
    <details class="sql-schema" open={!done}>
      <summary>{t('sql.tables')}</summary>
      <ul>
        {#each schema as tbl (tbl.name)}
          <li>
            <strong>{tbl.name}</strong> <span class="muted small">({t('sql.rows', { n: tbl.rows })})</span>
            <span class="sql-cols">
              {#each tbl.columns as col, i (col.name)}{i > 0 ? ', ' : ''}<span class:sql-pk={col.pk}>{col.name}</span> <span class="muted small">{col.type}</span>{/each}
            </span>
          </li>
        {/each}
      </ul>
    </details>
  {/if}

  <div class="code-head">
    <span class="code-lang">SQL</span>
    {#if !done}<button type="button" class="link small" onclick={() => ((sql = starter), (table = null), (error = ''), (verdict = undefined))}>{t('code.reset')}</button>{/if}
  </div>
  <CodeEditor bind:value={sql} label={t('sql.editorLabel')} readonly={done} />
  <div class="code-actions">
    <button type="button" class="btn" onclick={run} disabled={busy !== null || sql.trim() === ''}>{busy === 'run' ? t('code.running') : t('code.run')}</button>
    {#if !done}
      <button type="button" class="btn primary" onclick={check} disabled={busy !== null || sql.trim() === ''}>{busy === 'check' ? t('code.checking') : t('sql.check')}</button>
    {/if}
  </div>

  {#if timedOut}
    <p class="code-error" role="status">{t('code.timeout')}</p>
  {:else if error}
    <div class="code-result" role="status">
      <p class="code-label">{t('code.errorLabel')}</p>
      <pre class="code-out code-error">{error}</pre>
    </div>
  {:else if table}
    <div class="code-result" role="status">
      {#if table.columns.length === 0}
        <p class="muted small">{t('sql.noTable')}</p>
      {:else}
        <p class="code-label">{t('sql.resultRows', { n: table.rows.length })}</p>
        <div class="sql-table-wrap">
          <table class="sql-table">
            <thead><tr>{#each table.columns as c, i (i)}<th>{c}</th>{/each}</tr></thead>
            <tbody>
              {#each table.rows.slice(0, 50) as row, ri (ri)}
                <tr>{#each row as v, vi (vi)}<td class:sql-null={v === 'NULL'}>{v}</td>{/each}</tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if table.rows.length > 50}<p class="muted small">{t('sql.more', { n: table.rows.length - 50 })}</p>{/if}
      {/if}
      {#if verdict}
        {#if verdict.same}
          <p class="drill-right">{t('sql.same')}</p>
        {:else if verdict.reason === 'columns'}
          <p class="drill-wrong">{t('sql.diffColumns', { got: verdict.got, want: verdict.want })}</p>
        {:else if verdict.reason === 'rows'}
          <p class="drill-wrong">{t('sql.diffRows', { got: verdict.got, want: verdict.want })}</p>
        {:else if verdict.reason === 'order'}
          <p class="drill-wrong">{t('sql.diffOrder')}</p>
        {:else}
          <p class="drill-wrong">{t('sql.diffValues')}</p>
        {/if}
      {/if}
    </div>
  {/if}

  {#if showSolution && reference}
    <div class="code-solution">
      <p class="code-label">{t('code.solution')}</p>
      <pre class="code-out">{reference}</pre>
      {#if !done}<button type="button" class="btn" onclick={() => (sql = reference)}>{t('code.useSolution')}</button>{/if}
    </div>
  {/if}
</div>
