// Network plan (Netzplan, critical path method): earliest and latest start and end times, the
// buffers and the critical path of a project made of tasks with durations and predecessors.

export interface PlanTask {
  id: string;
  duration: number;
  /** Ids of the tasks that must be finished first. */
  after: string[];
}

export interface PlanRow {
  id: string;
  duration: number;
  after: string[];
  /** Earliest start (FAZ). */
  faz: number;
  /** Earliest end (FEZ). */
  fez: number;
  /** Latest start (SAZ). */
  saz: number;
  /** Latest end (SEZ). */
  sez: number;
  /** Total float (GP): how long it may slip without moving the project end. */
  gp: number;
  /** Free float (FP): how long it may slip without moving any successor. */
  fp: number;
  critical: boolean;
}

export interface Plan {
  rows: PlanRow[];
  /** Duration of the whole project. */
  duration: number;
  /** One critical path, in order. */
  criticalPath: string[];
}

export type PlanError =
  | { kind: 'empty' }
  | { kind: 'duplicate'; id: string }
  | { kind: 'unknown'; id: string; ref: string }
  | { kind: 'self'; id: string }
  | { kind: 'cycle' }
  | { kind: 'duration'; id: string };

export function computePlan(tasks: PlanTask[]): { plan: Plan } | { error: PlanError } {
  if (tasks.length === 0) return { error: { kind: 'empty' } };
  const byId = new Map<string, PlanTask>();
  for (const t of tasks) {
    if (byId.has(t.id)) return { error: { kind: 'duplicate', id: t.id } };
    if (!Number.isFinite(t.duration) || t.duration < 0) return { error: { kind: 'duration', id: t.id } };
    byId.set(t.id, t);
  }
  for (const t of tasks) {
    for (const ref of t.after) {
      if (ref === t.id) return { error: { kind: 'self', id: t.id } };
      if (!byId.has(ref)) return { error: { kind: 'unknown', id: t.id, ref } };
    }
  }
  // Topological order (Kahn); a leftover means a cycle.
  const indegree = new Map(tasks.map((t) => [t.id, t.after.length]));
  const successors = new Map<string, string[]>(tasks.map((t) => [t.id, []]));
  for (const t of tasks) for (const ref of t.after) successors.get(ref)!.push(t.id);
  const order: string[] = [];
  const queue = tasks.filter((t) => t.after.length === 0).map((t) => t.id);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of successors.get(id)!) {
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (order.length !== tasks.length) return { error: { kind: 'cycle' } };

  const faz = new Map<string, number>();
  const fez = new Map<string, number>();
  for (const id of order) {
    const t = byId.get(id)!;
    const start = t.after.length ? Math.max(...t.after.map((r) => fez.get(r)!)) : 0;
    faz.set(id, start);
    fez.set(id, start + t.duration);
  }
  const duration = Math.max(...fez.values());
  const saz = new Map<string, number>();
  const sez = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const t = byId.get(id)!;
    const next = successors.get(id)!;
    const end = next.length ? Math.min(...next.map((n) => saz.get(n)!)) : duration;
    sez.set(id, end);
    saz.set(id, end - t.duration);
  }
  const rows: PlanRow[] = tasks.map((t) => {
    const next = successors.get(t.id)!;
    const gp = saz.get(t.id)! - faz.get(t.id)!;
    const fp = (next.length ? Math.min(...next.map((n) => faz.get(n)!)) : duration) - fez.get(t.id)!;
    return { id: t.id, duration: t.duration, after: t.after, faz: faz.get(t.id)!, fez: fez.get(t.id)!, saz: saz.get(t.id)!, sez: sez.get(t.id)!, gp, fp, critical: gp === 0 };
  });
  // Walk one critical path from a critical start to the end.
  const crit = new Map(rows.map((r) => [r.id, r]));
  const path: string[] = [];
  let current = rows.find((r) => r.critical && r.after.length === 0) ?? rows.find((r) => r.critical);
  while (current) {
    path.push(current.id);
    const nextId: string | undefined = successors.get(current.id)!.find((n) => crit.get(n)!.critical && crit.get(n)!.faz === current!.fez);
    current = nextId ? crit.get(nextId) : undefined;
  }
  return { plan: { rows, duration, criticalPath: path } };
}

/** "B, C" -> ["B", "C"]; spaces, commas, semicolons and slashes separate; "-" and "" mean none. */
export function parseAfter(text: string): string[] {
  return text
    .split(/[\s,;/]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '' && s !== '-');
}
