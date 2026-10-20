import type { Question } from './types.ts';
import { gradeChess } from './chess.ts';

export function normalizeText(s: string): string {
  return s
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/u, '');
}

/**
 * Parses a learner's numeric answer. Tolerant on purpose: surrounding whitespace and a leading
 * `+` are ignored, and either a comma or a dot works as the decimal separator.
 */
export function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let s = value.trim().replace(/\s+/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  // A decimal comma and a decimal dot cannot both appear; the comma is the German separator.
  if (s.includes(',')) {
    if (s.includes('.')) return null;
    s = s.replace(',', '.');
  }
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function gradeNumeric(q: Question, given: unknown): boolean {
  if (typeof q.answer !== 'number' || !Number.isFinite(q.answer)) return false;
  const parsed = parseNumeric(given);
  if (parsed === null) return false;
  const tolerance =
    typeof q.tolerance === 'number' && Number.isFinite(q.tolerance) && q.tolerance > 0 ? q.tolerance : 0;
  // A tiny relative epsilon absorbs float parsing noise; it never accepts a real near-miss.
  return Math.abs(parsed - q.answer) <= tolerance + Number.EPSILON * Math.max(1, Math.abs(q.answer));
}

function normalizedSelection(given: unknown): number[] | null {
  if (!Array.isArray(given)) return null;
  const out: number[] = [];
  for (const value of given) {
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;
    out.push(value);
  }
  return out;
}

function correctSelection(q: Question): number[] {
  return Array.isArray(q.answer) ? q.answer.filter((v): v is number => typeof v === 'number') : [];
}

/** Exact set equality: every correct option chosen, and nothing else. Order does not matter. */
function gradeMultiSelect(q: Question, given: unknown): boolean {
  const selection = normalizedSelection(given);
  if (selection === null) return false;
  const correct = new Set(correctSelection(q));
  const chosen = new Set(selection);
  if (chosen.size !== selection.length) return false; // a repeated option is not a clean set
  if (chosen.size !== correct.size) return false;
  for (const index of correct) if (!chosen.has(index)) return false;
  return true;
}

/**
 * The three-state result for a multi-select answer. `partial` means everything chosen is correct
 * but at least one correct option is still missing - it says nothing about which one.
 */
export function multiSelectOutcome(q: Question, given: unknown): 'correct' | 'partial' | 'incorrect' {
  const selection = normalizedSelection(given);
  if (selection === null || selection.length === 0) return 'incorrect';
  const correct = new Set(correctSelection(q));
  const chosen = new Set(selection);
  const exact = chosen.size === correct.size && [...correct].every((index) => chosen.has(index));
  if (exact) return 'correct';
  // Partial only when everything chosen is right but something right is still missing.
  return selection.every((index) => correct.has(index)) ? 'partial' : 'incorrect';
}

/**
 * A matching answer is an array where entry i is the canonical index of the right the learner put
 * next to left i. Correct only when every left is matched to its own canonical right.
 */
function gradeMatching(q: Question, given: unknown): boolean {
  const pairs = Array.isArray(q.pairs) ? q.pairs : [];
  if (pairs.length === 0) return false;
  const selection = normalizedSelection(given);
  if (selection === null || selection.length !== pairs.length) return false;
  return selection.every((right, left) => right === left);
}

/**
 * An ordering answer is the learner's order written as canonical item indexes. Correct only when
 * the final order equals the canonical order exactly.
 */
function gradeOrdering(q: Question, given: unknown): boolean {
  const items = Array.isArray(q.items) ? q.items : [];
  if (items.length === 0) return false;
  const order = normalizedSelection(given);
  if (order === null || order.length !== items.length) return false;
  return order.every((itemIndex, position) => itemIndex === position);
}

/** Returns true when the given answer is correct for this question. */
export function gradeAnswer(q: Question, given: unknown): boolean {
  switch (q.kind) {
    case 'multiple-choice':
      return typeof given === 'number' && given === q.answer;
    case 'true-false':
      return typeof given === 'boolean' && given === q.answer;
    case 'short-answer':
    case 'fill-blank': {
      if (typeof given !== 'string' || given.trim() === '') return false;
      const accepted = Array.isArray(q.answer) ? q.answer : [q.answer];
      const g = normalizeText(given);
      return accepted.some((a) => typeof a === 'string' && normalizeText(a) === g);
    }
    case 'numeric':
      return gradeNumeric(q, given);
    case 'multi-select':
      return gradeMultiSelect(q, given);
    case 'matching':
      return gradeMatching(q, given);
    case 'ordering':
      return gradeOrdering(q, given);
    case 'chess':
      return gradeChess(q, given);
    default:
      return false;
  }
}

/** Edit distance with adjacent swaps (Damerau-Levenshtein, optimal string alignment). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min((d[i - 1]?.[j] ?? 0) + 1, (d[i]?.[j - 1] ?? 0) + 1, (d[i - 1]?.[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, (d[i - 2]?.[j - 2] ?? 0) + 1);
      (d[i] as number[])[j] = best;
    }
  }
  return d[rows - 1]?.[cols - 1] ?? 0;
}

export interface GradeResult {
  correct: boolean;
  /** Set when the answer only counted because a small typo was forgiven: the accepted spelling. */
  typoOf?: string;
}

/**
 * Grades an answer, optionally forgiving one small typo in a typed answer (two in long ones).
 * Short words are never forgiven, so "cat" never counts for "car". Numbers are never fuzzy.
 */
export function gradeWithTypos(q: Question, given: unknown, acceptTypos: boolean): GradeResult {
  if (gradeAnswer(q, given)) return { correct: true };
  if (!acceptTypos || (q.kind !== 'short-answer' && q.kind !== 'fill-blank') || typeof given !== 'string') return { correct: false };
  const g = normalizeText(given);
  if (g === '' || /^\d/.test(g)) return { correct: false };
  const accepted = Array.isArray(q.answer) ? q.answer : [q.answer];
  for (const a of accepted) {
    if (typeof a !== 'string') continue;
    const target = normalizeText(a);
    if (target.length < 5 || /\d/.test(target)) continue;
    const allowed = target.length >= 12 ? 2 : 1;
    if (editDistance(g, target) <= allowed) return { correct: true, typoOf: a };
  }
  return { correct: false };
}
