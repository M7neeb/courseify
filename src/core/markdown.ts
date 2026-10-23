import { marked, type TokenizerAndRendererExtension } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';

marked.setOptions({ gfm: true, breaks: false });

/** A formula as HTML (with MathML for screen readers); a broken formula shows as red source text. */
export function renderTex(tex: string, display: boolean): string {
  return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'htmlAndMathml', strict: false, trust: false });
}

// Formulas: $$ ... $$ (or \[ ... \]) on their own lines, $ ... $ (or \( ... \)) inside text. An
// inline $ must hug its formula ("$U = R \cdot I$") and may not be followed by a digit, so prices
// like "$5 and $10" stay text.
const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start(src: string) {
    const i = src.search(/\$\$|\\\[/);
    return i < 0 ? undefined : i;
  },
  tokenizer(src: string) {
    const m = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/.exec(src) ?? /^\\\[([\s\S]+?)\\\][ \t]*(?:\n|$)/.exec(src);
    if (m) return { type: 'mathBlock', raw: m[0], text: (m[1] ?? '').trim() };
    return undefined;
  },
  renderer(token) {
    return `<div class="cf-math">${renderTex(String(token.text), true)}</div>\n`;
  }
};

const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start(src: string) {
    const i = src.search(/\$|\\\(/);
    return i < 0 ? undefined : i;
  },
  tokenizer(src: string) {
    const display = /^\$\$(?!\s)([^$]+?)(?<!\s)\$\$/.exec(src);
    if (display) return { type: 'mathInline', raw: display[0], text: display[1], display: true };
    const m = /^\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?!\d)/.exec(src) ?? /^\\\(([\s\S]+?)\\\)/.exec(src);
    if (m) return { type: 'mathInline', raw: m[0], text: m[1], display: false };
    return undefined;
  },
  renderer(token) {
    return renderTex(String(token.text), token.display === true);
  }
};

marked.use({ extensions: [mathBlock, mathInline] });

// Course text is untrusted input (a generated file, or one someone shared), so it is never trusted as HTML.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Inline SVG from a course (a diagram for a hotspot question): drawing elements only, no scripts or links out. */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['a', 'foreignObject', 'image', 'use'] });
}

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  // Formulas bring MathML and small SVG pieces (roots, arrows), so those profiles are allowed too.
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true, mathMl: true, svg: true } });
}
