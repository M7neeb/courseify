// Selectable colour themes. Each theme is a COMPLETE palette (page, surface, ink, muted, line,
// accent, accent-ink, accent-soft, good, bad, mark) in both a light and a dark variant, so choosing
// a theme recolours the WHOLE app — background, cards, sidebar, borders and accent — not just the
// accent colour.
//
// The palettes live here as data and are turned into CSS by `themeCss()`, which App.svelte injects
// once. Keeping them in TypeScript means a unit test can prove every theme is complete.

export const COLOR_THEMES = ['default', 'ocean', 'forest', 'sunset', 'rose', 'slate', 'lavender', 'mint', 'amber', 'midnight'] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];

export interface Palette {
  /** Page background. */
  bg: string;
  /** Cards, sidebar, form fields, dialogs. */
  surface: string;
  /** Primary text. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** 1px borders and dividers. */
  line: string;
  /** Interactive colour. */
  accent: string;
  /** Text drawn on top of the accent. */
  accentInk: string;
  /** Tinted accent background (selected rows, soft chips). */
  accentSoft: string;
  /** Success (quiz correct, completed lessons). */
  good: string;
  /** Failure (quiz wrong, destructive). */
  bad: string;
  /** Highlight background (key points). */
  mark: string;
  /** Text drawn on the highlight. */
  markInk: string;
}

/** Semantic colours are shared by every theme so feedback stays instantly readable. */
const SEMANTIC_LIGHT = { good: '#1f7a45', bad: '#b3372f', mark: '#ffe08a', markInk: '#3b2e00' } as const;
const SEMANTIC_DARK = { good: '#58c489', bad: '#f08a82', mark: '#6b560f', markInk: '#ffeaa8' } as const;

/** A theme's own neutrals: what makes it look like a different theme rather than a different accent. */
interface Neutrals {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
}

const LIGHT_NEUTRALS: Record<ColorTheme, Neutrals> = {
  // `default` carries the Courseify look: a white surface, a light grey page, dark navy ink and
  // grey borders. The other nine themes keep their own neutrals (a theme must recolour its page,
  // not just its accent).
  default: { bg: '#f7f8fa', surface: '#ffffff', ink: '#1d2433', muted: '#586174', line: '#dde2ea' },
  ocean: { bg: '#edf3f8', surface: '#ffffff', ink: '#12202b', muted: '#4e6070', line: '#d3e1ea' },
  forest: { bg: '#eff5ee', surface: '#ffffff', ink: '#16231a', muted: '#55665a', line: '#d8e5d5' },
  sunset: { bg: '#fbf3ec', surface: '#fffdfb', ink: '#2a1c12', muted: '#6b5849', line: '#efdfd0' },
  rose: { bg: '#fbf0f4', surface: '#fffdfe', ink: '#291720', muted: '#6b4f5b', line: '#f0dae3' },
  slate: { bg: '#f1f3f6', surface: '#ffffff', ink: '#161b21', muted: '#535d69', line: '#dce1e8' },
  lavender: { bg: '#f4f0fa', surface: '#fffefe', ink: '#241b30', muted: '#665a73', line: '#e3d9ef' },
  mint: { bg: '#edf6f3', surface: '#fbfffd', ink: '#142923', muted: '#526c63', line: '#d4e7df' },
  amber: { bg: '#faf4e8', surface: '#fffefa', ink: '#2c2415', muted: '#706347', line: '#eadfc6' },
  midnight: { bg: '#eef1f8', surface: '#fbfcff', ink: '#171d2e', muted: '#59647d', line: '#dce2f0' }
};

const DARK_NEUTRALS: Record<ColorTheme, Neutrals> = {
  default: { bg: '#11141b', surface: '#191e28', ink: '#e6e9f0', muted: '#9ba4b6', line: '#2b3242' },
  ocean: { bg: '#0b1418', surface: '#0f1f2a', ink: '#e2ecf2', muted: '#8fa4b2', line: '#1d3341' },
  forest: { bg: '#0d150f', surface: '#142019', ink: '#e4efe6', muted: '#93a89a', line: '#223428' },
  sunset: { bg: '#17110c', surface: '#231a13', ink: '#f2e8e0', muted: '#b09a8b', line: '#392a1e' },
  rose: { bg: '#170d12', surface: '#23161d', ink: '#f2e4ea', muted: '#b394a1', line: '#392430' },
  slate: { bg: '#101418', surface: '#181d24', ink: '#e5e9ee', muted: '#98a2ae', line: '#2b323b' },
  lavender: { bg: '#15111b', surface: '#211a2b', ink: '#eee6f7', muted: '#aa9ab9', line: '#382a46' },
  mint: { bg: '#0e1714', surface: '#14231e', ink: '#e0f0e9', muted: '#91afa2', line: '#243a32' },
  amber: { bg: '#19150d', surface: '#262014', ink: '#f1ead8', muted: '#b8a985', line: '#40351e' },
  midnight: { bg: '#0d1220', surface: '#151d31', ink: '#e5eafb', muted: '#98a7c9', line: '#273653' }
};

export const PALETTES: Record<ColorTheme, { light: Palette; dark: Palette }> = {
  default: {
    light: { ...LIGHT_NEUTRALS.default, ...SEMANTIC_LIGHT, accent: '#2346b5', accentInk: '#ffffff', accentSoft: '#e9eefc' },
    dark: { ...DARK_NEUTRALS.default, ...SEMANTIC_DARK, accent: '#8fa8ff', accentInk: '#0b1638', accentSoft: '#1f2a4b' }
  },
  ocean: {
    light: { ...LIGHT_NEUTRALS.ocean, ...SEMANTIC_LIGHT, accent: '#0b6fa4', accentInk: '#ffffff', accentSoft: '#dcecf5' },
    dark: { ...DARK_NEUTRALS.ocean, ...SEMANTIC_DARK, accent: '#5cb8e6', accentInk: '#06222e', accentSoft: '#10303d' }
  },
  forest: {
    light: { ...LIGHT_NEUTRALS.forest, ...SEMANTIC_LIGHT, accent: '#2f7d32', accentInk: '#ffffff', accentSoft: '#e1f0e0' },
    dark: { ...DARK_NEUTRALS.forest, ...SEMANTIC_DARK, accent: '#6fc46f', accentInk: '#062506', accentSoft: '#14301a' }
  },
  sunset: {
    light: { ...LIGHT_NEUTRALS.sunset, ...SEMANTIC_LIGHT, accent: '#c2410c', accentInk: '#ffffff', accentSoft: '#fbe6d8' },
    dark: { ...DARK_NEUTRALS.sunset, ...SEMANTIC_DARK, accent: '#f29b62', accentInk: '#331604', accentSoft: '#3a2313' }
  },
  rose: {
    light: { ...LIGHT_NEUTRALS.rose, ...SEMANTIC_LIGHT, accent: '#b02a63', accentInk: '#ffffff', accentSoft: '#f9e2ec' },
    dark: { ...DARK_NEUTRALS.rose, ...SEMANTIC_DARK, accent: '#ef8ab4', accentInk: '#33071a', accentSoft: '#3a1526' }
  },
  slate: {
    light: { ...LIGHT_NEUTRALS.slate, ...SEMANTIC_LIGHT, accent: '#475569', accentInk: '#ffffff', accentSoft: '#e6eaf0' },
    dark: { ...DARK_NEUTRALS.slate, ...SEMANTIC_DARK, accent: '#b6bec9', accentInk: '#10151a', accentSoft: '#232c36' }
  },
  lavender: {
    light: { ...LIGHT_NEUTRALS.lavender, ...SEMANTIC_LIGHT, accent: '#7952a8', accentInk: '#ffffff', accentSoft: '#eee4f8' },
    dark: { ...DARK_NEUTRALS.lavender, ...SEMANTIC_DARK, accent: '#c2a0ee', accentInk: '#241333', accentSoft: '#342543' }
  },
  mint: {
    light: { ...LIGHT_NEUTRALS.mint, ...SEMANTIC_LIGHT, accent: '#26735c', accentInk: '#ffffff', accentSoft: '#dcefe8' },
    dark: { ...DARK_NEUTRALS.mint, ...SEMANTIC_DARK, accent: '#66c5a4', accentInk: '#08271c', accentSoft: '#183b30' }
  },
  amber: {
    light: { ...LIGHT_NEUTRALS.amber, ...SEMANTIC_LIGHT, accent: '#9a6412', accentInk: '#ffffff', accentSoft: '#f4e8ce' },
    dark: { ...DARK_NEUTRALS.amber, ...SEMANTIC_DARK, accent: '#e8b95e', accentInk: '#2d1c03', accentSoft: '#403117' }
  },
  midnight: {
    light: { ...LIGHT_NEUTRALS.midnight, ...SEMANTIC_LIGHT, accent: '#435da5', accentInk: '#ffffff', accentSoft: '#e2e8f7' },
    dark: { ...DARK_NEUTRALS.midnight, ...SEMANTIC_DARK, accent: '#91aaff', accentInk: '#101a38', accentSoft: '#202d50' }
  }
};

export function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === 'string' && (COLOR_THEMES as readonly string[]).includes(value);
}

/** `ocean` etc. from a possibly old saved value (`mono` is the old name for `slate`). */
export function normalizeColorTheme(value: unknown): ColorTheme | undefined {
  if (value === 'mono') return 'slate';
  return isColorTheme(value) ? value : undefined;
}

function declarations(p: Palette): string {
  return [
    `--bg:${p.bg}`,
    `--surface:${p.surface}`,
    `--ink:${p.ink}`,
    `--muted:${p.muted}`,
    `--line:${p.line}`,
    `--accent:${p.accent}`,
    `--accent-ink:${p.accentInk}`,
    `--accent-soft:${p.accentSoft}`,
    `--good:${p.good}`,
    `--bad:${p.bad}`,
    `--mark:${p.mark}`,
    `--mark-ink:${p.markInk}`
  ].join(';');
}

/**
 * The mastery colours: ballpoint blue filling in. Attempted is a grey outline, Familiar half
 * filled in light blue, Proficient solid blue, Mastered deep ink blue (with a crown), plus the pale
 * quiz / unit-test tile. Shared by every theme (like the semantic colours) because a tier's colour
 * means the same thing everywhere, so the ramp is emitted once.
 */
export interface MasteryRamp {
  mastered: string;
  proficient: string;
  familiar: string;
  attempted: string;
  notStarted: string;
  /** Background of the quiz and unit-test tiles. */
  quiz: string;
  /** Icon colour on the quiz and unit-test tiles. */
  test: string;
}

export const MASTERY_RAMP_LIGHT: MasteryRamp = {
  mastered: '#1b2d7a',
  proficient: '#3d63d6',
  familiar: '#7d98e0',
  attempted: '#8e98ab',
  notStarted: '#c2c8d3',
  quiz: '#eef1f6',
  test: '#586174'
};

export const MASTERY_RAMP_DARK: MasteryRamp = {
  mastered: '#b4c4ff',
  proficient: '#7192f2',
  familiar: '#4b64b3',
  attempted: '#7d879b',
  notStarted: '#3b4354',
  quiz: '#232a38',
  test: '#b6bfd0'
};

function rampDeclarations(r: MasteryRamp): string {
  return [
    `--mastery-mastered:${r.mastered}`,
    `--mastery-proficient:${r.proficient}`,
    `--mastery-familiar:${r.familiar}`,
    `--mastery-attempted:${r.attempted}`,
    `--mastery-not-started:${r.notStarted}`,
    `--mastery-quiz:${r.quiz}`,
    `--mastery-test:${r.test}`
  ].join(';');
}

/**
 * CSS for every theme and both schemes. Injected once by App.svelte.
 * `data-theme` is light | dark | system; `data-color-theme` is one of COLOR_THEMES.
 */
export function themeCss(): string {
  const parts: string[] = [];
  // The mastery ramp is theme-independent, so it sits on :root and only follows light/dark.
  parts.push(`:root{${rampDeclarations(MASTERY_RAMP_LIGHT)}}`);
  parts.push(`:root[data-theme='dark']{${rampDeclarations(MASTERY_RAMP_DARK)}}`);
  parts.push(
    `@media (prefers-color-scheme: dark){:root[data-theme='system']{${rampDeclarations(MASTERY_RAMP_DARK)}}}`
  );
  for (const theme of COLOR_THEMES) {
    const p = PALETTES[theme];
    parts.push(`:root[data-color-theme='${theme}']{${declarations(p.light)};color-scheme:light}`);
    parts.push(`:root[data-color-theme='${theme}'][data-theme='dark']{${declarations(p.dark)};color-scheme:dark}`);
    parts.push(
      `@media (prefers-color-scheme: dark){:root[data-color-theme='${theme}'][data-theme='system']{${declarations(
        p.dark
      )};color-scheme:dark}}`
    );
  }
  return parts.join('\n');
}
