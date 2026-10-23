// The course glossary: technical terms with a short definition, in every language the course has.
// A course can bring its own ("glossary" on the course or on a unit); otherwise the glossary is
// built from the course's flashcards whose front is a short term.

import type { Course, GlossaryEntry } from './types.ts';
import { resolveFlashcards, type Lang } from './localize.ts';

/** One term as shown in one language. */
export interface GlossaryTerm {
  /** The words that are highlighted in the text: the term and its other spellings. */
  words: string[];
  term: string;
  definition: string;
  /** The same term in the course's other language, when there is one. */
  other?: { lang: Lang; term: string };
}

const MAX_TERM = 40;

/** A flashcard front that is a term, not a question: short, a few words, no question mark. */
function looksLikeTerm(front: string): boolean {
  const text = front.replace(/[*_`]/g, '').trim();
  return text.length >= 2 && text.length <= MAX_TERM && !/[?:]/.test(text) && text.split(/\s+/).length <= 4;
}

function plain(text: string): string {
  return text.replace(/[*_`]/g, '').trim();
}

/** Every glossary entry of a course: its own glossaries first, then terms from its flashcards. */
export function courseGlossary(course: Course): GlossaryEntry[] {
  const own: GlossaryEntry[] = [...(course.glossary ?? []), ...course.modules.flatMap((m) => m.glossary ?? [])];
  if (own.length > 0) return own;
  const out: GlossaryEntry[] = [];
  const seen = new Set<string>();
  for (const m of course.modules) {
    for (const l of m.lessons) {
      for (const block of l.blocks) {
        if (block.type !== 'flashcards') continue;
        const de = resolveFlashcards(block, 'de');
        const en = resolveFlashcards(block, 'en');
        const base = Array.isArray(block.cards) ? (block.cards as { front: string; back: string }[]) : [];
        base.forEach((card, i) => {
          if (!looksLikeTerm(card.front)) return;
          const key = plain(card.front).toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          const entry: GlossaryEntry = { term: plain(card.front), definition: card.back };
          const i18n: NonNullable<GlossaryEntry['i18n']> = {};
          const d = de[i];
          const e = en[i];
          if (d && looksLikeTerm(d.front)) i18n.de = { term: plain(d.front), definition: d.back };
          if (e && looksLikeTerm(e.front)) i18n.en = { term: plain(e.front), definition: e.back };
          if (Object.keys(i18n).length > 0) entry.i18n = i18n;
          out.push(entry);
        });
      }
    }
  }
  return out;
}

/** The glossary in one language, ready to highlight. Longer terms first, so they win over parts. */
export function glossaryTerms(entries: readonly GlossaryEntry[], lang: Lang): GlossaryTerm[] {
  const other: Lang = lang === 'de' ? 'en' : 'de';
  const out: GlossaryTerm[] = [];
  for (const entry of entries) {
    const local = entry.i18n?.[lang];
    const term = plain(local?.term ?? entry.term);
    const definition = local?.definition ?? entry.definition;
    if (!term || !definition) continue;
    const aliases = (local?.aliases ?? entry.aliases ?? []).map(plain).filter(Boolean);
    const otherTerm = entry.i18n?.[other]?.term;
    out.push({
      words: [...new Set([term, ...aliases])],
      term,
      definition,
      ...(otherTerm && plain(otherTerm).toLowerCase() !== term.toLowerCase() ? { other: { lang: other, term: plain(otherTerm) } } : {})
    });
  }
  return out.sort((a, b) => Math.max(...b.words.map((w) => w.length)) - Math.max(...a.words.map((w) => w.length)));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One regular expression that finds any of the terms as whole words. */
export function termPattern(terms: readonly GlossaryTerm[]): RegExp | null {
  const words = terms.flatMap((t) => t.words).filter((w) => w.length >= 2).sort((a, b) => b.length - a.length);
  if (words.length === 0) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(${words.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

/** Which term a found word belongs to. */
export function termFor(terms: readonly GlossaryTerm[], word: string): GlossaryTerm | undefined {
  const w = word.toLowerCase();
  return terms.find((t) => t.words.some((x) => x.toLowerCase() === w));
}
