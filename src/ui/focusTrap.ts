// Keeps Tab and Shift+Tab inside an open dialog or side menu.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Where Tab goes next among `count` controls: wraps at both ends, and starts at an end when focus is outside (-1). */
export function nextFocusIndex(count: number, current: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return backwards ? (current - 1 + count) % count : (current + 1) % count;
}

/** Call from a keydown handler while the dialog is open. Returns true when it moved the focus itself. */
export function trapTab(event: KeyboardEvent, container: HTMLElement | null): boolean {
  if (event.key !== 'Tab' || !container) return false;
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
  if (items.length === 0) return false;
  const current = items.indexOf(document.activeElement as HTMLElement);
  const atEdge = current < 0 || (event.shiftKey ? current === 0 : current === items.length - 1);
  if (!atEdge) return false;
  event.preventDefault();
  items[nextFocusIndex(items.length, current, event.shiftKey)]?.focus();
  return true;
}
