import { resolveCalloutMarkdown, resolveTextLevels, type Lang } from './localize.ts';
import type { Block, ExplanationLevel, Lesson } from './types.ts';

// Lesson text read aloud with the device's own voices (Web Speech API): the Markdown turned into
// plain sentences, then cut into short pieces. Safari stops reading long texts part of the way
// through, and a piece per sentence or two also lets Stop react at once.

/** Code and diagrams are not read; a formula is read as its symbols. */
export function speechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => ` ${plainTex(tex)}. `)
    .replace(/\$([^$\n]+?)\$/g, (_, tex: string) => plainTex(tex))
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (/^\|?\s*:?-{3,}/.test(trimmed)) return '';
      // A table row is read as its cells: "Kilo, k, 10 hoch 3."
      if (trimmed.startsWith('|')) return trimmed.split('|').map((c) => c.trim()).filter(Boolean).join(', ') + '.';
      return trimmed
        .replace(/^#{1,6}\s+(.*)$/, '$1.')
        .replace(/^>\s?/, '')
        .replace(/^(?:[-*+]|\d+[.)])\s+/, '');
    })
    .join('\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/** TeX as something a voice can read: \frac{a}{b} becomes a / b, \cdot a dot, other commands go. */
function plainTex(tex: string): string {
  return tex
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1 / $2')
    .replace(/\\(?:cdot|times)/g, ' · ')
    .replace(/\\(?:,|;|quad|qquad)/g, ' ')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pieces of whole sentences, each at most about `max` characters (a single long sentence stays whole). */
export function speechChunks(text: string, max = 220): string[] {
  const sentences = text.split(/(?<=[.!?:;])\s+/).filter((s) => s.trim() !== '');
  const out: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + 1 + sentence.length > max) {
      out.push(current);
      current = sentence;
    } else current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) out.push(current);
  return out;
}

/** The voice language for a course language: the region most voices on phones and PCs have. */
export function speechLang(lang: string): string {
  return lang === 'de' ? 'de-DE' : lang === 'en' ? 'en-US' : lang;
}

/** What "Read aloud" reads for a lesson: its title, then its text, key points and examples in order. */
export function lessonSpeech(lesson: Lesson, lang: Lang, level: ExplanationLevel = 'normal'): string {
  const parts = [`# ${lesson.title}`];
  for (const block of (lesson.blocks ?? []) as Block[]) {
    if (block.type === 'text') {
      const levels = resolveTextLevels(block, lang);
      parts.push(levels[level] ?? levels.normal ?? '');
    } else if (block.type === 'callout' || block.type === 'example') {
      parts.push(resolveCalloutMarkdown(block, lang));
    }
  }
  return parts.filter((p) => p.trim() !== '').join('\n\n');
}
