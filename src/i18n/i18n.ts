import en from './en.json';
import de from './de.json';
import { app } from '../core/state.svelte.ts';

const dictionaries: Record<string, Record<string, string>> = { en, de };

/** Looks up a UI string in the chosen language, falls back to English, then to the key itself. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const lang = app.settings.uiLanguage;
  const raw = dictionaries[lang]?.[key] ?? dictionaries.en?.[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** The same lookup in a given language, for course content shown in the course's language. */
export function tIn(lang: string, key: string, vars: Record<string, string | number> = {}): string {
  const raw = dictionaries[lang]?.[key] ?? dictionaries.en?.[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
