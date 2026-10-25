<script lang="ts">
  // Netzplan builder: enter tasks with a duration and their predecessors, see the earliest and
  // latest times, the buffers and the critical path.
  import { computePlan, parseAfter, type PlanError } from '../../core/netzplan.ts';
  import { tIn } from '../../i18n/i18n.ts';

  let { lang }: { lang: string } = $props();
  const tr = (key: string, vars: Record<string, string | number> = {}) => tIn(lang, key, vars);

  interface Row {
    key: number;
    id: string;
    duration: string;
    after: string;
  }
  let nextKey = 7;
  let rows = $state<Row[]>([
    { key: 1, id: 'A', duration: '3', after: '' },
    { key: 2, id: 'B', duration: '2', after: 'A' },
    { key: 3, id: 'C', duration: '4', after: 'A' },
    { key: 4, id: 'D', duration: '3', after: 'B' },
    { key: 5, id: 'E', duration: '2', after: 'B, C' },
    { key: 6, id: 'F', duration: '1', after: 'D, E' }
  ]);

  const result = $derived(
    computePlan(rows.map((r) => ({ id: r.id.trim(), duration: r.duration.trim() === '' ? Number.NaN : Number(r.duration.replace(',', '.')), after: parseAfter(r.after) })))
  );

  function add() {
    const used = new Set(rows.map((r) => r.id.trim()));
    const letter = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((l) => !used.has(l)) ?? `T${nextKey}`;
    rows.push({ key: nextKey++, id: letter, duration: '1', after: '' });
  }

  function remove(key: number) {
    rows = rows.filter((r) => r.key !== key);
  }

  const errorText = (e: PlanError): string => {
    switch (e.kind) {
      case 'empty':
        return tr('np.err.empty');
      case 'duplicate':
        return tr('np.err.duplicate', { id: e.id });
      case 'unknown':
        return tr('np.err.unknown', { id: e.id, ref: e.ref });
      case 'self':
        return tr('np.err.self', { id: e.id });
      case 'cycle':
        return tr('np.err.cycle');
      case 'duration':
        return tr('np.err.duration', { id: e.id });
    }
  };
</script>

<div class="np">
  <p class="muted">{tr('np.intro')}</p>
  <div class="np-wrap">
    <table class="np-input" aria-label={tr('np.tasks')}>
      <thead><tr><th>{tr('np.task')}</th><th>{tr('np.duration')}</th><th>{tr('np.after')}</th><th></th></tr></thead>
      <tbody>
        {#each rows as r (r.key)}
          <tr>
            <td><input aria-label={tr('np.task')} bind:value={r.id} maxlength="6" autocomplete="off" /></td>
            <td><input aria-label={tr('np.duration')} bind:value={r.duration} inputmode="decimal" autocomplete="off" /></td>
            <td><input aria-label={tr('np.after')} bind:value={r.after} placeholder="-" autocomplete="off" /></td>
            <td><button type="button" class="link small" onclick={() => remove(r.key)} aria-label={tr('np.remove', { id: r.id })}>×</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div><button type="button" class="btn" onclick={add}>{tr('np.add')}</button></div>

  {#if 'error' in result}
    <p class="drill-wrong" role="alert">{errorText(result.error)}</p>
  {:else}
    <p class="np-sum" role="status">{tr('np.total', { n: result.plan.duration })} · {tr('np.critical')}: <strong data-testid="np-path">{result.plan.criticalPath.join(' → ')}</strong></p>
    <div class="np-wrap">
      <table class="np-result" aria-label={tr('np.result')}>
        <thead>
          <tr><th>{tr('np.task')}</th><th>D</th><th>FAZ</th><th>FEZ</th><th>SAZ</th><th>SEZ</th><th>GP</th><th>FP</th></tr>
        </thead>
        <tbody>
          {#each result.plan.rows as r (r.id)}
            <tr class:np-crit={r.critical}>
              <th scope="row">{r.id}</th><td>{r.duration}</td><td>{r.faz}</td><td>{r.fez}</td><td>{r.saz}</td><td>{r.sez}</td><td>{r.gp}</td><td>{r.fp}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <ul class="muted small">
      <li>{tr('np.legend.faz')}</li>
      <li>{tr('np.legend.saz')}</li>
      <li>{tr('np.legend.gp')}</li>
      <li>{tr('np.legend.fp')}</li>
    </ul>
  {/if}
</div>
