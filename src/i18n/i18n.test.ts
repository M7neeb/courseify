import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./${name}.json`, import.meta.url), 'utf8')) as Record<string, string>;

test('English and German have exactly the same keys', () => {
  const en = Object.keys(load('en')).sort();
  const de = Object.keys(load('de')).sort();
  assert.deepEqual(de, en);
});

test('placeholders such as {n} match between languages', () => {
  const en = load('en');
  const de = load('de');
  const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const key of Object.keys(en)) assert.equal(names(de[key] ?? ''), names(en[key] ?? ''), key);
});

test('the reading font menu names fonts the app really bundles', () => {
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const bundled = [...main.matchAll(/@fontsource\/([\w-]+)\//g)].map((m) => m[1].replace(/-/g, ' '));
  for (const lang of ['en', 'de']) {
    for (const key of ['settings.readingFont.default', 'settings.readingFont.hyperlegible']) {
      const label = load(lang)[key].toLowerCase();
      assert.ok(bundled.some((font) => label.startsWith(font)), `${lang} ${key}: "${label}"`);
    }
  }
});

test('earned points are called points everywhere, never XP', () => {
  for (const lang of ['en', 'de']) {
    for (const [key, text] of Object.entries(load(lang))) assert.doesNotMatch(text, /\bXP\b/, `${lang} ${key}`);
  }
});

test('no screen writes "XP" into its markup, past the translations', async () => {
  const { readdirSync } = await import('node:fs');
  const root = new URL('../', import.meta.url);
  const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => f.endsWith('.svelte'));
  for (const file of files) {
    const markup = readFileSync(new URL(file, root), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    assert.doesNotMatch(markup, /[}>]\s*XP\b/, file);
  }
});
