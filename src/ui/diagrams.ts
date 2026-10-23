// Turns ```mermaid code blocks in lesson text into drawn diagrams (flowcharts, ER diagrams,
// sequences, timelines). Mermaid is large, so it is only loaded the first time a page has one.
// One watcher on the page handles every place lesson text appears.

type MermaidApi = typeof import('mermaid').default;

let mermaidPromise: Promise<MermaidApi> | null = null;
let counter = 0;

function isDark(): boolean {
  const bg = getComputedStyle(document.body).backgroundColor;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
  if (!m) return false;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid').then((mod) => {
    const mermaid = mod.default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: isDark() ? 'dark' : 'default', fontFamily: 'inherit' });
    return mermaid;
  });
  return mermaidPromise;
}

async function draw(code: HTMLElement): Promise<void> {
  const pre = code.parentElement;
  if (!pre || pre.dataset.diagram) return;
  pre.dataset.diagram = 'pending';
  const source = code.textContent ?? '';
  try {
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render(`cf-diagram-${(counter += 1)}`, source);
    const figure = document.createElement('div');
    figure.className = 'cf-diagram';
    figure.setAttribute('role', 'img');
    figure.setAttribute('aria-label', source.split('\n')[0]?.trim() || 'Diagram');
    figure.innerHTML = svg;
    pre.replaceWith(figure);
  } catch {
    // A diagram that does not parse stays as its source text, which still says what it means.
    pre.dataset.diagram = 'failed';
  }
}

function scan(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('pre > code.language-mermaid').forEach((code) => void draw(code));
}

/** Watches the page for diagram code blocks. Call once at start-up. */
export function watchDiagrams(): void {
  if (typeof MutationObserver === 'undefined') return;
  scan(document);
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node instanceof HTMLElement) {
          if (node.matches('pre > code.language-mermaid')) void draw(node);
          else if (node.querySelector('code.language-mermaid')) scan(node);
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
