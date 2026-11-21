// A whole course's flashcards as one deck. Pure: building the deck and the order of a session.

import { resolveFlashcards, type Lang } from './localize.ts';
import { seededRng } from './drills.ts';
import type { Course } from './types.ts';

export interface DeckCard {
  /** Stable within a course: block id plus the card's place in it. */
  id: string;
  front: string;
  back: string;
  lessonId: string;
  lessonTitle: string;
  moduleId: string;
}

/** Every flashcard of the course (or of one unit), in course order. Cards with the same front are kept once. */
export function courseDeck(course: Course, lang: Lang, moduleId?: string): DeckCard[] {
  const deck: DeckCard[] = [];
  const seen = new Set<string>();
  for (const module of course.modules) {
    if (moduleId && module.id !== moduleId) continue;
    for (const lesson of module.lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'flashcards') continue;
        resolveFlashcards(block, lang).forEach((card, index) => {
          const key = card.front.trim().toLocaleLowerCase();
          if (key === '' || seen.has(key)) return;
          seen.add(key);
          deck.push({ id: `${block.id}:${index}`, front: card.front, back: card.back, lessonId: lesson.id, lessonTitle: lesson.title, moduleId: module.id });
        });
      }
    }
  }
  return deck;
}

export function shuffleDeck<T>(cards: readonly T[], seed: number): T[] {
  const random = seededRng(seed);
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * The queue after the front card was answered. A card you knew leaves the deck; one you missed
 * comes back a few cards later, not straight away, so it is recalled and not just repeated.
 */
export function afterAnswer<T>(queue: readonly T[], knewIt: boolean, gap = 4): T[] {
  const [front, ...rest] = queue;
  if (front === undefined || knewIt) return rest;
  const at = Math.min(gap, rest.length);
  return [...rest.slice(0, at), front, ...rest.slice(at)];
}

/** One line of a text export: no tabs or line breaks inside a field, no Markdown stars. */
function field(text: string): string {
  return text.replace(/\*\*|__/g, '').replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * The deck as plain text that Anki ("Import" a text file) and Quizlet ("Import" pasted text) both
 * read: front, a tab, back, and the lesson as an Anki tag. The lines starting with # tell Anki how
 * to read the file; Courseify's own term list import skips them, so a deck can come back too.
 */
export function deckToText(cards: readonly DeckCard[]): string {
  const lines = ['#separator:tab', '#html:false', '#tags column:3'];
  for (const card of cards) {
    const tag = card.lessonTitle.trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_:-]/gu, '');
    lines.push([field(card.front), field(card.back), tag].join('\t'));
  }
  return lines.join('\n') + '\n';
}
