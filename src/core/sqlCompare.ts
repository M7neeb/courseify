// Comparing the result table of a learner's SQL with the expected one. Column names do not matter
// (aliases are free); the values and the number of columns and rows do. Row order matters only when
// the question says "ordered".

export interface SqlTable {
  columns: string[];
  rows: string[][];
}

export type SqlVerdict =
  | { same: true }
  | { same: false; reason: 'columns'; got: number; want: number }
  | { same: false; reason: 'rows'; got: number; want: number }
  | { same: false; reason: 'values' }
  | { same: false; reason: 'order' };

/** "3", "3.0" and "3.00" are the same number; text is compared as it is, ignoring case and outer spaces. */
export function cell(v: string): string {
  const s = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return String(Number(s));
  return s.toLowerCase();
}

const rowKey = (row: string[]): string => JSON.stringify(row.map(cell));

export function compareTables(got: SqlTable, want: SqlTable, ordered = false): SqlVerdict {
  if (got.columns.length !== want.columns.length) return { same: false, reason: 'columns', got: got.columns.length, want: want.columns.length };
  if (got.rows.length !== want.rows.length) return { same: false, reason: 'rows', got: got.rows.length, want: want.rows.length };
  const a = got.rows.map(rowKey);
  const b = want.rows.map(rowKey);
  if (ordered && a.every((k, i) => k === b[i])) return { same: true };
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  if (!sortedA.every((k, i) => k === sortedB[i])) return { same: false, reason: 'values' };
  return ordered ? { same: false, reason: 'order' } : { same: true };
}
