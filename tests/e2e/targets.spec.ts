import { test, expect } from '@playwright/test';

// Every button, field and link that is a control (not a word inside a sentence) is at least 24 x 24 px.

const ROUTES = ['#/home', '#/library', '#/drills', '#/drills/subnet', '#/drills/bits', '#/drills/walk', '#/drills/terminal', '#/drills/capture', '#/settings', '#/play', '#/prompt', '#/stats', '#/review'];

test('controls on the main screens are at least 24 px', async ({ page }) => {
  const small: string[] = [];
  for (const route of ROUTES) {
    await page.goto('./' + route);
    await page.waitForTimeout(400);
    const found = await page.evaluate(() => {
      const out: string[] = [];
      const controls = document.querySelectorAll<HTMLElement>('button, summary, select, input:not([type=hidden]), textarea, [role=button], a[class*="btn"], a.cf-btn, nav a, .cf-tabbar a, .drills-item');
      for (const el of controls) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || el.closest('[hidden]')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // Visually hidden helpers (screen reader only) are not tap targets.
        if (rect.width <= 1 || rect.height <= 1) continue;
        if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) continue;
        if (rect.width < 24 || rect.height < 24) out.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').join('.')} ${Math.round(rect.width)}x${Math.round(rect.height)} "${(el.textContent || '').trim().slice(0, 20)}"`);
      }
      return out;
    });
    for (const f of found) small.push(`${route}: ${f}`);
  }
  expect(small).toEqual([]);
});
