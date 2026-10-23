<script lang="ts">
  // Draws functions of x on a grid. Sliders change the parameters live; dragging over the graph
  // (or the arrow keys) moves a point along a curve and reads off its value. Zoom with + and −.
  import { untrack } from 'svelte';
  import { samplePath, shortNum, ticks, type GraphParam } from '../../core/graph.ts';
  import { tIn } from '../../i18n/i18n.ts';

  let {
    functions,
    params = [],
    x: xRange,
    y: yRange,
    points = [],
    lang
  }: {
    functions: { label: string; f: (scope: Record<string, number>) => number }[];
    params?: GraphParam[];
    x: [number, number];
    y: [number, number];
    points?: [number, number][];
    lang: string;
  } = $props();

  const tr = (key: string, vars: Record<string, string | number> = {}) => tIn(lang, key, vars);
  const helpId = `graph-help-${Math.random().toString(36).slice(2, 8)}`;
  const W = 600;
  const H = 400;

  let values = $state<Record<string, number>>({});
  let view = $state(untrack(() => ({ x: [...xRange] as [number, number], y: [...yRange] as [number, number] })));
  let traceX = $state<number | null>(null);
  let traceFn = $state(0);
  let svg = $state<SVGSVGElement | null>(null);
  let dragging = false;

  // A new range from outside (the plotter's fields) resets the view.
  $effect(() => {
    const next = { x: [...xRange] as [number, number], y: [...yRange] as [number, number] };
    untrack(() => (view = next));
  });
  /** Each slider's value: what the learner set, or where the slider starts. */
  const scope = $derived(Object.fromEntries(params.map((p) => [p.name, values[p.name] ?? p.value])));

  const px = (x: number) => ((x - view.x[0]) / (view.x[1] - view.x[0])) * W;
  const py = (y: number) => H - ((y - view.y[0]) / (view.y[1] - view.y[0])) * H;
  const evalAt = (i: number, x: number) => functions[i]?.f({ ...scope, x }) ?? NaN;

  const xTicks = $derived(ticks(view.x[0], view.x[1], 10));
  const yTicks = $derived(ticks(view.y[0], view.y[1], 8));
  const axisY = $derived(Math.min(H - 14, Math.max(14, py(0))));
  const axisX = $derived(Math.min(W - 24, Math.max(4, px(0))));

  const paths = $derived(
    functions.map((fn) =>
      samplePath((x) => fn.f({ ...scope, x }), view.x[0], view.x[1], view.y[0], view.y[1])
        .map((piece) => piece.map(([x, y], i) => `${i ? 'L' : 'M'}${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(''))
        .join('')
    )
  );

  const traceY = $derived(traceX === null ? NaN : evalAt(traceFn, traceX));
  const readout = $derived(
    traceX === null ? '' : `${functions[traceFn]?.label ?? 'f'}(${shortNum(traceX)}) = ${Number.isFinite(traceY) ? shortNum(traceY) : tr('graph.undefined')}`
  );

  /** x under the finger, snapped to a hundredth of the visible width so readings stay tidy. */
  function graphX(clientX: number): number {
    const box = svg!.getBoundingClientRect();
    const x = view.x[0] + ((clientX - box.left) / box.width) * (view.x[1] - view.x[0]);
    const step = ticks(view.x[0], view.x[1], 100)[1] - ticks(view.x[0], view.x[1], 100)[0] || (view.x[1] - view.x[0]) / 100;
    return Math.min(view.x[1], Math.max(view.x[0], Number((Math.round(x / step) * step).toPrecision(10))));
  }
  function graphY(clientY: number): number {
    const box = svg!.getBoundingClientRect();
    return view.y[1] - ((clientY - box.top) / box.height) * (view.y[1] - view.y[0]);
  }

  /** The curve closest to where the finger is. */
  function nearestFn(x: number, y: number): number {
    let best = traceFn;
    let dist = Infinity;
    functions.forEach((_, i) => {
      const d = Math.abs(evalAt(i, x) - y);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    return best;
  }

  function pointerDown(e: PointerEvent) {
    if (!svg) return;
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    const x = graphX(e.clientX);
    traceFn = nearestFn(x, graphY(e.clientY));
    traceX = x;
  }
  function pointerMove(e: PointerEvent) {
    if (dragging && svg) traceX = graphX(e.clientX);
  }
  function pointerUp() {
    dragging = false;
  }

  function key(e: KeyboardEvent) {
    const grid = ticks(view.x[0], view.x[1], 100);
    const step = grid[1] - grid[0] || (view.x[1] - view.x[0]) / 100;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const start = traceX ?? (view.x[0] + view.x[1]) / 2;
      traceX = Math.min(view.x[1], Math.max(view.x[0], Number((start + (e.key === 'ArrowRight' ? step : -step)).toPrecision(10))));
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && functions.length > 1) {
      e.preventDefault();
      traceFn = (traceFn + (e.key === 'ArrowUp' ? 1 : functions.length - 1)) % functions.length;
      traceX ??= (view.x[0] + view.x[1]) / 2;
    }
  }

  function zoom(factor: number) {
    const cx = (view.x[0] + view.x[1]) / 2;
    const cy = (view.y[0] + view.y[1]) / 2;
    const hx = ((view.x[1] - view.x[0]) / 2) * factor;
    const hy = ((view.y[1] - view.y[0]) / 2) * factor;
    view = { x: [cx - hx, cx + hx], y: [cy - hy, cy + hy] };
  }
  function reset() {
    view = { x: [...xRange] as [number, number], y: [...yRange] as [number, number] };
    traceX = null;
  }
</script>

<div class="graph">
  <div class="graph-frame">
    <svg
      bind:this={svg}
      viewBox={`0 0 ${W} ${H}`}
      class="graph-svg"
      role="slider"
      aria-valuemin={view.x[0]}
      aria-valuemax={view.x[1]}
      aria-valuenow={traceX ?? (view.x[0] + view.x[1]) / 2}
      aria-valuetext={readout || tr('graph.help')}
      tabindex="0"
      aria-label={tr('graph.label', { fns: functions.map((f) => f.label).join(', ') })}
      aria-describedby={helpId}
      onpointerdown={pointerDown}
      onpointermove={pointerMove}
      onpointerup={pointerUp}
      onpointercancel={pointerUp}
      onkeydown={key}
    >
      <g class="graph-grid">
        {#each xTicks as v (v)}<line x1={px(v)} x2={px(v)} y1="0" y2={H} />{/each}
        {#each yTicks as v (v)}<line x1="0" x2={W} y1={py(v)} y2={py(v)} />{/each}
      </g>
      <g class="graph-axes">
        {#if view.y[0] <= 0 && view.y[1] >= 0}<line x1="0" x2={W} y1={py(0)} y2={py(0)} />{/if}
        {#if view.x[0] <= 0 && view.x[1] >= 0}<line x1={px(0)} x2={px(0)} y1="0" y2={H} />{/if}
      </g>
      <g class="graph-labels" aria-hidden="true">
        {#each xTicks as v (v)}{#if v !== 0 && px(v) > 14 && px(v) < W - 14}<text x={px(v)} y={axisY + 13} text-anchor="middle">{shortNum(v)}</text>{/if}{/each}
        {#each yTicks as v (v)}{#if v !== 0 && py(v) > 12 && py(v) < H - 8}<text x={axisX + 5} y={py(v) + 4}>{shortNum(v)}</text>{/if}{/each}
      </g>
      {#each paths as d, i (i)}
        <path class={`graph-curve c${i}`} {d} />
      {/each}
      {#each points as [x, y], i (i)}
        <circle class="graph-point" cx={px(x)} cy={py(y)} r="5" />
        <text class="graph-point-label" x={px(x) + 8} y={py(y) - 8}>({shortNum(x)} | {shortNum(y)})</text>
      {/each}
      {#if traceX !== null && Number.isFinite(traceY)}
        <line class="graph-trace-line" x1={px(traceX)} x2={px(traceX)} y1={axisY} y2={py(traceY)} />
        <circle class={`graph-trace c${traceFn}`} cx={px(traceX)} cy={py(traceY)} r="7" />
      {/if}
    </svg>
    <div class="graph-zoom">
      <button type="button" class="cf-icon-btn" aria-label={tr('graph.zoomIn')} onclick={() => zoom(0.5)}>+</button>
      <button type="button" class="cf-icon-btn" aria-label={tr('graph.zoomOut')} onclick={() => zoom(2)}>−</button>
      <button type="button" class="cf-icon-btn graph-reset" aria-label={tr('graph.reset')} onclick={reset}>⟲</button>
    </div>
  </div>
  <p class="graph-readout" aria-live="polite">
    {#if readout}<strong>{readout}</strong>{:else}<span id={helpId} class="muted small">{tr('graph.help')}</span>{/if}
  </p>
  {#if functions.length > 1}
    <ul class="graph-legend">
      {#each functions as fn, i (i)}
        <li><span class={`graph-swatch c${i}`}></span>{fn.label}</li>
      {/each}
    </ul>
  {/if}
  {#if params.length}
    <div class="graph-params">
      {#each params as p (p.name)}
        <label class="graph-param">
          <span><strong>{p.label ?? p.name}</strong> = {shortNum(scope[p.name])}</span>
          <input type="range" min={p.min} max={p.max} step={p.step} value={scope[p.name]} oninput={(e) => (values[p.name] = Number(e.currentTarget.value))} />
        </label>
      {/each}
    </div>
  {/if}
</div>
