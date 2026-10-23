// "Tap a term": underlines the course's glossary terms in lesson text (the first time each one
// appears in a block) and shows its meaning, with the term in the other language, in a small box.

import { app, getCourse } from '../core/state.svelte.ts';
import { courseGlossary, glossaryTerms, termFor, termPattern, type GlossaryTerm } from '../core/glossary.ts';
import { renderMarkdown } from '../core/markdown.ts';
import type { Lang } from '../core/localize.ts';
import { t } from '../i18n/i18n.ts';

const SKIP = 'code, pre, a, button, h1, h2, h3, h4, h5, h6, .katex, .cf-term, .cf-diagram, input, textarea, select, label';
const BLOCKS = '.block.text .prose, .block.example .prose, .block.callout';

const cache = new Map<string, { terms: GlossaryTerm[]; pattern: RegExp | null }>();

function termsOf(courseId: string, lang: Lang): { terms: GlossaryTerm[]; pattern: RegExp | null } {
  const course = getCourse(courseId);
  const key = `${courseId}:${lang}:${course?.version ?? 0}:${course?.modules.length ?? 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const terms = course ? glossaryTerms(courseGlossary(course), lang) : [];
  const value = { terms, pattern: termPattern(terms) };
  cache.set(key, value);
  return value;
}

/** A short fingerprint of a text, to notice when a block shows different text. */
function fingerprint(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${text.length}.${(h >>> 0).toString(36)}`;
}

function mark(container: HTMLElement): void {
  const host = container.closest<HTMLElement>('[data-course]');
  const courseId = host?.dataset.course;
  if (!courseId || app.settings.glossaryTerms === false) return;
  const lang: Lang = (host?.getAttribute('lang') === 'de' ? 'de' : 'en');
  const { terms, pattern } = termsOf(courseId, lang);
  if (!pattern) return;
  // The same text is marked again only when it changes (another level or language).
  const signature = `${lang}:${fingerprint(container.textContent ?? '')}`;
  if (container.dataset.terms === signature) return;
  container.dataset.terms = signature;
  const used = new Set<GlossaryTerm>(
    [...container.querySelectorAll<HTMLElement>('.cf-term')].map((b) => termFor(terms, b.textContent ?? '')).filter((x): x is GlossaryTerm => !!x)
  );
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  for (const node of nodes) {
    const text = node.data;
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    let last = 0;
    const parts: (string | HTMLElement)[] = [];
    while ((match = pattern.exec(text))) {
      const term = termFor(terms, match[0]);
      if (!term || used.has(term)) continue;
      used.add(term);
      if (match.index > last) parts.push(text.slice(last, match.index));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cf-term';
      button.textContent = match[0];
      button.dataset.termLang = lang;
      button.setAttribute('aria-haspopup', 'dialog');
      parts.push(button);
      last = match.index + match[0].length;
    }
    if (parts.length === 0) continue;
    if (last < text.length) parts.push(text.slice(last));
    node.replaceWith(...parts);
  }
}

let pop: HTMLDivElement | null = null;
let opener: HTMLElement | null = null;

function closePop(): void {
  pop?.remove();
  pop = null;
  opener?.setAttribute('aria-expanded', 'false');
  opener = null;
}

function openPop(button: HTMLElement): void {
  const host = button.closest<HTMLElement>('[data-course]');
  const courseId = host?.dataset.course;
  if (!courseId) return;
  const lang: Lang = button.dataset.termLang === 'de' ? 'de' : 'en';
  const term = termFor(termsOf(courseId, lang).terms, button.textContent ?? '');
  if (!term) return;
  if (opener === button) {
    closePop();
    return;
  }
  closePop();
  opener = button;
  button.setAttribute('aria-expanded', 'true');
  pop = document.createElement('div');
  pop.className = 'cf-term-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', term.term);
  const title = document.createElement('p');
  title.className = 'cf-term-title';
  title.textContent = term.term;
  if (term.other) {
    const other = document.createElement('span');
    other.className = 'cf-term-other';
    other.textContent = ` · ${term.other.lang.toUpperCase()}: ${term.other.term}`;
    title.append(other);
  }
  const body = document.createElement('div');
  body.className = 'prose cf-term-def';
  body.innerHTML = renderMarkdown(term.definition);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cf-term-close';
  close.setAttribute('aria-label', t('glossary.close'));
  close.textContent = '×';
  close.addEventListener('click', closePop);
  pop.append(close, title, body);
  document.body.append(pop);
  const r = button.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 24);
  pop.style.width = `${width}px`;
  pop.style.left = `${Math.max(12, Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - width - 12))}px`;
  pop.style.top = `${window.scrollY + r.bottom + 6}px`;
  close.focus();
}

/** Watches lesson text for glossary terms. Call once at start-up. */
export function watchGlossary(): void {
  if (typeof MutationObserver === 'undefined') return;
  const scan = (root: ParentNode) => root.querySelectorAll<HTMLElement>(BLOCKS).forEach(mark);
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      scan(document);
    });
  };
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true });
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const term = target?.closest<HTMLElement>('.cf-term');
    if (term) {
      event.preventDefault();
      openPop(term);
    } else if (pop && !target?.closest('.cf-term-pop')) closePop();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pop) {
      const back = opener;
      closePop();
      back?.focus();
    }
  });
  window.addEventListener('hashchange', closePop);
  queue();
}
