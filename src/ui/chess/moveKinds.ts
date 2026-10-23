// How each review class looks: the mark on the board and in the move list, and its colour.
import type { MoveKind } from '../../core/review.ts';

export const KIND_STYLE: Record<MoveKind, { text: string; color: string }> = {
  brilliant: { text: '!!', color: '#1baaa6' },
  great: { text: '!', color: '#5b8bb0' },
  best: { text: '★', color: '#81b64c' },
  excellent: { text: '✓', color: '#81b64c' },
  good: { text: '✓', color: '#95af8a' },
  book: { text: '≡', color: '#a88865' },
  inaccuracy: { text: '?!', color: '#e6b130' },
  mistake: { text: '?', color: '#e58f2a' },
  miss: { text: '✕', color: '#ee6b55' },
  blunder: { text: '??', color: '#ca3431' }
};
