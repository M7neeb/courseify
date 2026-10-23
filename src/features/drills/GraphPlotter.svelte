<script lang="ts">
  // Type up to three functions and see them drawn. Letters other than x become sliders.
  import { compile, ExprError, freeLetters } from '../../core/expr.ts';
  import type { GraphParam } from '../../core/graph.ts';
  import { app } from '../../core/state.svelte.ts';
  import GraphView from '../../ui/graph/GraphView.svelte';
  import { t } from '../../i18n/i18n.ts';

  const LABELS = ['f', 'g', 'h'];
  let exprs = $state(['a*x^2 + b', 'sin(x)', '']);
  let xMin = $state(-10);
  let xMax = $state(10);
  let yMin = $state(-8);
  let yMax = $state(8);

  /** Letters other than x used in the functions become sliders from -5 to 5. */
  const paramNames = $derived([...new Set(exprs.flatMap((e) => freeLetters(e)))].sort().slice(0, 4));
  const params = $derived<GraphParam[]>(paramNames.map((name) => ({ name, min: -5, max: 5, step: 0.1, value: 1 })));

  const parsed = $derived(
    exprs.map((e, i) => {
      if (!e.trim()) return { error: '', fn: null };
      try {
        return { error: '', fn: { label: LABELS[i], f: compile(e, ['x', ...paramNames]) } };
      } catch (err) {
        return { error: err instanceof ExprError ? err.message : 'error', fn: null };
      }
    })
  );
  const functions = $derived(parsed.flatMap((p) => (p.fn ? [p.fn] : [])));
  const xRange = $derived<[number, number]>(xMin < xMax ? [xMin, xMax] : [-10, 10]);
  const yRange = $derived<[number, number]>(yMin < yMax ? [yMin, yMax] : [-8, 8]);
</script>

<div class="graph-plotter stack">
  {#if functions.length}
    <GraphView {functions} {params} x={xRange} y={yRange} lang={app.settings.uiLanguage} />
  {/if}
  {#each exprs as _, i (i)}
    <label class="graph-fn-field">
      <span class={`graph-swatch c${i}`}></span>
      <span class="graph-fn-name">{LABELS[i]}(x) =</span>
      <input type="text" bind:value={exprs[i]} spellcheck="false" autocomplete="off" autocapitalize="off" placeholder={t('graph.fnPlaceholder')} aria-invalid={parsed[i].error ? 'true' : undefined} />
    </label>
    {#if parsed[i].error}<p class="graph-fn-error small">{t('graph.cannotRead', { why: parsed[i].error })}</p>{/if}
  {/each}
  <details class="graph-range">
    <summary>{t('graph.range')}</summary>
    <div class="graph-range-fields">
      <label>x {t('graph.from')} <input type="number" bind:value={xMin} /></label>
      <label>{t('graph.to')} <input type="number" bind:value={xMax} /></label>
      <label>y {t('graph.from')} <input type="number" bind:value={yMin} /></label>
      <label>{t('graph.to')} <input type="number" bind:value={yMax} /></label>
    </div>
  </details>
  <p class="muted small">{t('graph.syntax')}</p>
</div>
