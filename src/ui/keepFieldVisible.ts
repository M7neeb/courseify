// A field that gets focus must not end up behind a fixed bar at the bottom of the screen (the tab
// bar, or the quiz bar with the Check button) or behind the on-screen keyboard.

const FIELDS = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, select';

/** The part of the bottom of the viewport taken by fixed or sticky bars, in pixels. */
export function bottomBarsHeight(root: Document = document): number {
  let height = 0;
  for (const el of root.querySelectorAll<HTMLElement>('.cf-tabbar, .quiz-bar')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || (style.position !== 'fixed' && style.position !== 'sticky')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height > 0 && rect.bottom >= window.innerHeight - 2) height = Math.max(height, rect.height);
  }
  return height;
}

/** How far the page must scroll so the field's bottom edge clears the bars and the keyboard (0 when it already does). */
export function scrollNeeded(fieldBottom: number, visibleHeight: number, barsHeight: number, margin = 12): number {
  const limit = visibleHeight - barsHeight - margin;
  return fieldBottom > limit ? Math.ceil(fieldBottom - limit) : 0;
}

export function installKeepFieldVisible(): void {
  const check = (el: Element) => {
    const rect = el.getBoundingClientRect();
    const visible = window.visualViewport?.height ?? window.innerHeight;
    const by = scrollNeeded(rect.bottom, visible, bottomBarsHeight());
    if (by > 0) window.scrollBy({ top: by, behavior: 'smooth' });
  };
  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.matches(FIELDS)) return;
    // The keyboard takes a moment to slide in and to resize the visible area.
    setTimeout(() => {
      if (document.activeElement === target) check(target);
    }, 320);
  });
  window.visualViewport?.addEventListener('resize', () => {
    const active = document.activeElement;
    if (active && active.matches(FIELDS)) check(active);
  });
}
