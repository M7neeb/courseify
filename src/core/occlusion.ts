// Image occlusion: a picture with covered parts the learner uncovers one by one or is tested on.
// The block: { type: "occlusion", url | svg, alt?, areas: [{ x, y, w, h, label }], i18n?: { de: { svg?, alt?, areaLabels? } } }
// where x, y, w, h are percent of the picture's width and height.

import type { Block } from './types.ts';

export interface Mask {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The masks of an occlusion block in one language; areas that are not on the picture are dropped. */
export function occlusionMasks(block: Block, lang: string): Mask[] {
  const raw = Array.isArray(block.areas) ? (block.areas as unknown[]) : [];
  const i18n = (block.i18n as Record<string, { areaLabels?: string[] }> | undefined)?.[lang];
  const masks: Mask[] = [];
  raw.forEach((a, i) => {
    if (typeof a !== 'object' || a === null) return;
    const { x, y, w, h, label } = a as Record<string, unknown>;
    if (!isNum(x) || !isNum(y) || !isNum(w) || !isNum(h) || w <= 0 || h <= 0) return;
    if (x < 0 || y < 0 || x + w > 100.0001 || y + h > 100.0001) return;
    const text = i18n?.areaLabels?.[i] ?? (typeof label === 'string' ? label : '');
    masks.push({ x, y, w, h, label: text });
  });
  return masks;
}

/** The picture source and description in one language: inline SVG, or a link. */
export function occlusionPicture(block: Block, lang: string): { svg: string; url: string; alt: string } {
  const i18n = (block.i18n as Record<string, { svg?: string; alt?: string }> | undefined)?.[lang];
  return {
    svg: i18n?.svg ?? (typeof block.svg === 'string' ? block.svg : ''),
    url: typeof block.url === 'string' && /^https?:\/\//i.test(block.url) ? block.url : '',
    alt: i18n?.alt ?? (typeof block.alt === 'string' ? block.alt : '')
  };
}

/** A random order of the masks to be tested on, each once. */
export function testOrder(count: number, rng: () => number = Math.random): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
