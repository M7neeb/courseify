// IPv6 drills: shorten, expand, name the type of an address, and split a /48 into /64 subnets.
// Pure helpers plus the drill definitions (imported by drills.ts).

import type { DrillDef, Level, Line, Rng } from './drills.ts';

const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
const k = (key: string, v?: Record<string, string | number>): Line => (v ? { k: key, v } : { k: key });
const mono = (s: string): Line => ({ mono: s });

/** Eight numbers from "2001:db8::1", or null when it is not an IPv6 address. A trailing "/64" is ignored. */
export function parseIpv6(text: string): number[] | null {
  const s = text.trim().replace(/\/\d{1,3}$/, '').toLowerCase();
  if (!s || /[^0-9a-f:]/.test(s) || s.includes(':::')) return null;
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const read = (part: string): number[] | null => {
    if (part === '') return [];
    const groups = part.split(':');
    if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
    return groups.map((g) => parseInt(g, 16));
  };
  const head = read(halves[0]);
  if (!head) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const tail = read(halves[1]);
  if (!tail || head.length + tail.length > 7) return null;
  return [...head, ...Array(8 - head.length - tail.length).fill(0), ...tail];
}

/** All eight groups with four digits each: "2001:0db8:0000:...". */
export const expandIpv6 = (g: number[]): string => g.map((x) => x.toString(16).padStart(4, '0')).join(':');

/** The shortest form (RFC 5952): no leading zeros, the longest run of two or more zero groups becomes "::". */
export function shortenIpv6(g: number[]): string {
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (g[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = g.map((x) => x.toString(16));
  if (bestLen < 2) return hex.join(':');
  return `${hex.slice(0, bestStart).join(':')}::${hex.slice(bestStart + bestLen).join(':')}`;
}

export const sameIpv6 = (a: string, b: string): boolean => {
  const x = parseIpv6(a);
  const y = parseIpv6(b);
  return !!x && !!y && x.every((v, i) => v === y[i]);
};

/** The learner typed exactly the shortest form (case does not matter). */
export const isShortestIpv6 = (given: string, answer: string): boolean => given.trim().toLowerCase().replace(/\/\d+$/, '') === answer.toLowerCase();

/** The learner typed all 8 groups, four digits each, with the right values. */
export function isFullIpv6(given: string, answer: string): boolean {
  const s = given.trim().toLowerCase();
  return /^([0-9a-f]{4}:){7}[0-9a-f]{4}$/.test(s) && s === answer.toLowerCase();
}

function randomGroups(rng: Rng, level: Level): number[] {
  const zeroChance = level === 1 ? 0.55 : 0.5;
  const g = [0x2001, 0x0db8];
  for (let i = 2; i < 8; i++) {
    if (rng() < zeroChance) g.push(0);
    else g.push(level === 1 ? int(rng, 1, 0xff) : rng() < 0.5 ? int(rng, 1, 0xff) : int(rng, 0x100, 0xffff));
  }
  // Force a visible run of zeros so that "::" has something to do.
  const run = int(rng, 2, level === 1 ? 3 : 4);
  const at = int(rng, 2, 8 - run);
  for (let i = at; i < at + run; i++) g[i] = 0;
  return g;
}

/** The expanded form with some zero groups written short ("0" instead of "0000"), the way people see them. */
function looseForm(g: number[]): string {
  return g.map((x) => x.toString(16)).join(':');
}

const ipv6Short: DrillDef = {
  id: 'ipv6-short',
  group: 'it',
  make(rng, level) {
    const g = randomGroups(rng, level);
    const full = expandIpv6(g);
    const short = shortenIpv6(g);
    return {
      prompt: [k('drill.ipv6Short.p'), mono(full)],
      answer: short,
      type: 'ipv6short',
      steps: [
        k('drill.s.v6Leading'),
        mono(looseForm(g)),
        k('drill.s.v6Run'),
        k('drill.s.v6Once'),
        k('drill.s.together', { answer: short })
      ]
    };
  }
};

const ipv6Long: DrillDef = {
  id: 'ipv6-long',
  group: 'it',
  make(rng, level) {
    const g = randomGroups(rng, level);
    const full = expandIpv6(g);
    const short = shortenIpv6(g);
    const hidden = 8 - short.split(/::|:/).filter(Boolean).length;
    return {
      prompt: [k('drill.ipv6Long.p'), mono(short)],
      answer: full,
      type: 'ipv6full',
      steps: [k('drill.s.v6Fill', { n: hidden }), mono(looseForm(g)), k('drill.s.v6Pad'), k('drill.s.together', { answer: full })]
    };
  }
};

interface Kind {
  make(rng: Rng): number[];
  rule: string;
}

const KINDS: Kind[] = [
  { make: () => [0, 0, 0, 0, 0, 0, 0, 1], rule: 'drill.s.v6Loopback' },
  { make: (rng) => [0xfe80 + int(rng, 0, 0x3f), 0, 0, 0, int(rng, 1, 0xffff), int(rng, 1, 0xffff), int(rng, 1, 0xffff), int(rng, 1, 0xffff)], rule: 'drill.s.v6LinkLocal' },
  { make: (rng) => [(rng() < 0.5 ? 0xfc00 : 0xfd00) + int(rng, 0, 0xff), int(rng, 0, 0xffff), int(rng, 0, 0xffff), int(rng, 0, 0xffff), 0, 0, int(rng, 0, 0xff), int(rng, 1, 0xffff)], rule: 'drill.s.v6Ula' },
  { make: (rng) => [0x2000 + int(rng, 1, 0x1fff), int(rng, 0, 0xffff), int(rng, 0, 0xffff), int(rng, 0, 0xffff), 0, 0, 0, int(rng, 1, 0xffff)], rule: 'drill.s.v6Global' },
  { make: (rng) => [0xff00 + int(rng, 0x02, 0x0e), 0, 0, 0, 0, 0, int(rng, 0, 0xff), int(rng, 1, 0xff)], rule: 'drill.s.v6Multicast' },
  { make: () => [0, 0, 0, 0, 0, 0, 0, 0], rule: 'drill.s.v6Unspecified' }
];

const ipv6Type: DrillDef = {
  id: 'ipv6-type',
  group: 'it',
  make(rng, level) {
    const pool = level === 1 ? [0, 1, 3, 4] : [0, 1, 2, 3, 4, 5];
    const idx = pool[int(rng, 0, pool.length - 1)];
    const g = KINDS[idx].make(rng);
    const short = shortenIpv6(g);
    return {
      prompt: [
        k('drill.ipv6Type.p'),
        mono(short),
        k('drill.ipv6Type.choices'),
        mono('1  ::1'),
        mono('2  fe80::/10'),
        mono('3  fc00::/7'),
        mono('4  2000::/3'),
        mono('5  ff00::/8'),
        mono('6  ::')
      ],
      answer: String(idx + 1),
      type: 'int',
      steps: [k('drill.s.v6Start', { first: short.split(':')[0] || '::' }), k(KINDS[idx].rule), k('drill.s.together', { answer: String(idx + 1) })]
    };
  }
};

const ipv6Split: DrillDef = {
  id: 'ipv6-split',
  group: 'it',
  make(rng, level) {
    const site = [0x2001, 0x0db8, int(rng, 1, 0xffff)];
    const n = level === 1 ? int(rng, 2, 9) : level === 2 ? int(rng, 10, 255) : int(rng, 256, 4095);
    const prefix = `${site.map((x) => x.toString(16)).join(':')}::/48`;
    const answer = `${site.map((x) => x.toString(16)).join(':')}:${(n - 1).toString(16)}::/64`;
    return {
      prompt: [k('drill.ipv6Split.p', { n }), mono(prefix)],
      answer,
      type: 'ipv6',
      steps: [
        k('drill.s.v6Split'),
        k('drill.s.v6Count', { n, m: n - 1 }),
        ...(n - 1 > 9 ? [k('drill.s.v6Hex', { m: n - 1, hex: (n - 1).toString(16) })] : []),
        k('drill.s.together', { answer })
      ]
    };
  }
};

export const IPV6_DRILLS: DrillDef[] = [ipv6Short, ipv6Long, ipv6Type, ipv6Split];
