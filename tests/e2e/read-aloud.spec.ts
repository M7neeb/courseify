import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const sampleCourse = fileURLToPath(new URL('../../examples/sample-course.json', import.meta.url));
const etCourse = fileURLToPath(new URL('../../courses/elektrotechnik-grundlagen.json', import.meta.url));

// A stand-in for the browser's voices: records what would be spoken and when speech is cancelled.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const log: { spoken: { text: string; lang: string }[]; cancels: number } = { spoken: [], cancels: 0 };
    let queue: { onend: null | (() => void); onerror: null | (() => void) }[] = [];
    (window as unknown as { speechLog: typeof log }).speechLog = log;
    class Utterance {
      text: string; lang = ''; voice = null; onend: null | (() => void) = null; onerror: null | (() => void) = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak(u: Utterance) { log.spoken.push({ text: u.text, lang: u.lang }); queue.push(u); },
        cancel() { log.cancels += 1; const q = queue; queue = []; q.forEach((u) => u.onerror?.()); },
        getVoices() { return []; },
        finish() { const q = queue; queue = []; q.forEach((u) => u.onend?.()); }
      }
    });
  });
});

test('Read aloud reads the lesson in its language, stops on request and when the lesson changes', async ({ page }) => {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(sampleCourse);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.goto('./#/course/networking-basics/m1-l1');

  const read = page.getByRole('button', { name: 'Read aloud' });
  await read.click();
  const log = () => page.evaluate(() => (window as unknown as { speechLog: { spoken: { text: string; lang: string }[]; cancels: number } }).speechLog);
  const first = await log();
  expect(first.spoken.length).toBeGreaterThan(1);
  expect(first.spoken[0].text).toContain('What is a network?');
  expect(first.spoken.every((s) => s.text.length < 260 && !s.text.includes('**'))).toBe(true);
  await expect(page.getByRole('button', { name: 'Stop reading' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Stop reading' }).click();
  await expect(page.getByRole('button', { name: 'Read aloud' })).toBeVisible();

  // Reading to the end turns the button back.
  await read.click();
  await page.evaluate(() => (window.speechSynthesis as unknown as { finish(): void }).finish());
  await expect(page.getByRole('button', { name: 'Read aloud' })).toBeVisible();

  // Leaving the lesson while it reads cancels the voice.
  await read.click();
  const cancelsBefore = (await log()).cancels;
  await page.goto('./#/home');
  await expect(page.getByRole('heading', { name: 'My courses' })).toBeVisible();
  expect((await log()).cancels).toBeGreaterThan(cancelsBefore);
});

test('German lessons are read with a German voice', async ({ page }) => {
  await page.goto('./#/import');
  await page.locator('input[type="file"]').setInputFiles(etCourse);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('main').getByText(/Imported/)).toBeVisible();
  await page.goto('./#/course/elektrotechnik-grundlagen/m1-l1');
  await page.getByRole('group', { name: /language/i }).getByRole('button', { name: 'Deutsch' }).click();
  await page.getByRole('button', { name: 'Read aloud' }).click();
  const spoken = await page.evaluate(() => (window as unknown as { speechLog: { spoken: { text: string; lang: string }[] } }).speechLog.spoken);
  expect(spoken.length).toBeGreaterThan(2);
  expect(spoken.every((s) => s.lang === 'de-DE')).toBe(true);
  expect(spoken.map((s) => s.text).join(' ')).toContain('Präfix');
});
