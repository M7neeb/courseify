// The graph block: one to four functions of x drawn on a grid, with sliders for their parameters.
// { "type": "graph", "functions": [{ "expr": "a*x^2 + b", "label": "f" }], "params": [{ "name": "a",
//   "min": -3, "max": 3, "step": 0.5, "value": 1 }], "x": [-6, 6], "y": [-4, 8], "points": [[1, 2]] }

import { compile, ExprError } from './expr.ts';

export interface GraphParam {
  name: string;
  min: number;
  max: number;
  step: number;
  value: number;
  label?: string;
}

export interface GraphSpec {
  functions: { expr: string; label: string; f: (scope: Record<string, number>) => number }[];
  params: GraphParam[];
  x: [number, number];
  y: [number, number];
  points: [number, number][];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRange = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) && v[0] < v[1];

function rawFunctions(b: Record<string, unknown>): unknown[] {
  if (Array.isArray(b.functions)) return b.functions;
  if (typeof b.expr === 'string') return [{ expr: b.expr }];
  return [];
}

/** What is wrong with a graph block, as messages starting with the field name. */
export function graphErrors(b: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const params = Array.isArray(b.params) ? b.params : [];
  if (b.params !== undefined && !Array.isArray(b.params)) errors.push('params: must be a list.');
  if (params.length > 4) errors.push('params: at most 4 sliders.');
  const names: string[] = [];
  params.forEach((p, i) => {
    const q = p as Record<string, unknown>;
    if (typeof q?.name !== 'string' || !/^[a-wyzA-Z]$/.test(q.name)) errors.push(`params[${i}].name: one letter other than x.`);
    else names.push(q.name);
    if (!isNum(q?.min) || !isNum(q?.max) || q.min >= q.max) errors.push(`params[${i}]: needs "min" below "max".`);
  });
  const fns = rawFunctions(b);
  if (fns.length === 0 || fns.length > 4) errors.push('functions: one to four functions, each with "expr".');
  fns.forEach((fn, i) => {
    const expr = (fn as Record<string, unknown>)?.expr;
    if (typeof expr !== 'string' || !expr.trim()) {
      errors.push(`functions[${i}].expr: required text such as "x^2 - 1".`);
      return;
    }
    try {
      compile(expr, ['x', ...names]);
    } catch (err) {
      errors.push(`functions[${i}].expr: "${expr}" cannot be read (${err instanceof ExprError ? err.message : 'error'}).`);
    }
  });
  if (b.x !== undefined && !isRange(b.x)) errors.push('x: [smallest, largest].');
  if (b.y !== undefined && !isRange(b.y)) errors.push('y: [smallest, largest].');
  if (b.points !== undefined && !(Array.isArray(b.points) && b.points.every((pt) => Array.isArray(pt) && pt.length === 2 && isNum(pt[0]) && isNum(pt[1])))) {
    errors.push('points: a list of [x, y] pairs.');
  }
  return errors;
}

/** The block read into a ready-to-draw spec; anything broken is left out. */
export function readGraph(b: Record<string, unknown>): GraphSpec {
  const params: GraphParam[] = [];
  for (const raw of Array.isArray(b.params) ? b.params.slice(0, 4) : []) {
    const q = raw as Record<string, unknown>;
    if (typeof q?.name !== 'string' || !/^[a-wyzA-Z]$/.test(q.name) || !isNum(q.min) || !isNum(q.max) || q.min >= q.max) continue;
    const step = isNum(q.step) && q.step > 0 ? q.step : (q.max - q.min) / 100;
    const value = isNum(q.value) ? Math.min(q.max, Math.max(q.min, q.value)) : q.min;
    params.push({ name: q.name, min: q.min, max: q.max, step, value, label: typeof q.label === 'string' ? q.label : undefined });
  }
  const names = ['x', ...params.map((p) => p.name)];
  const functions: GraphSpec['functions'] = [];
  rawFunctions(b)
    .slice(0, 4)
    .forEach((raw, i) => {
      const fn = raw as Record<string, unknown>;
      if (typeof fn?.expr !== 'string') return;
      try {
        functions.push({ expr: fn.expr, label: typeof fn.label === 'string' ? fn.label : ['f', 'g', 'h', 'k'][i], f: compile(fn.expr, names) });
      } catch {
        // Skipped; validation reports it.
      }
    });
  const x: [number, number] = isRange(b.x) ? b.x : [-10, 10];
  const y: [number, number] = isRange(b.y) ? b.y : [-10, 10];
  const points = Array.isArray(b.points) ? (b.points.filter((pt) => Array.isArray(pt) && pt.length === 2 && isNum(pt[0]) && isNum(pt[1])) as [number, number][]) : [];
  return { functions, params, x, y, points };
}

/**
 * Samples a function across [x0, x1] into SVG path pieces in graph units. The line breaks where the
 * function is undefined or jumps off the visible range (1/x at 0, tan x).
 */
export function samplePath(f: (x: number) => number, x0: number, x1: number, y0: number, y1: number, samples = 400): [number, number][][] {
  const pieces: [number, number][][] = [];
  let current: [number, number][] = [];
  const span = y1 - y0;
  let prev: number | null = null;
  for (let i = 0; i <= samples; i++) {
    const x = x0 + ((x1 - x0) * i) / samples;
    const y = f(x);
    const ok = Number.isFinite(y) && y > y0 - span * 4 && y < y1 + span * 4;
    const jump = prev !== null && ok && Math.abs(y - prev) > span * 2;
    if (!ok || jump) {
      if (current.length > 1) pieces.push(current);
      current = [];
    }
    if (ok) current.push([x, y]);
    prev = ok ? y : null;
  }
  if (current.length > 1) pieces.push(current);
  return pieces;
}

/** Tidy tick positions: about `count` steps of 1, 2 or 5 times a power of ten. */
export function ticks(lo: number, hi: number, count = 8): number[] {
  const raw = (hi - lo) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toPrecision(10)));
  return out;
}

/** A number for a label: at most 2 decimals, no trailing zeros. */
export function shortNum(v: number): string {
  if (!Number.isFinite(v)) return '–';
  return String(Number(v.toFixed(Math.abs(v) >= 100 ? 0 : 2)));
}
