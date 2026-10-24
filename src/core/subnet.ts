// The subnet drill: endless tasks with several boxes, each box checked on its own. Four kinds:
// find everything about a host, pick the subnet size for a number of hosts, same network or not,
// and fixed exam tasks. Text is stored as i18n keys plus values, like the other drills.

import { seededRng, type Level, type Line, type Rng } from './drills.ts';

export { seededRng };

export type SubnetMode = 'full' | 'vlsm' | 'same' | 'exam';
export type FieldKind = 'ip' | 'int' | 'yesno';

export const SUBNET_MODES: SubnetMode[] = ['full', 'vlsm', 'same', 'exam'];

export interface SubnetField {
  id: string;
  /** i18n key of the box label. */
  label: string;
  kind: FieldKind;
  /** "192.168.1.64", "62", "yes". */
  answer: string;
  /** For 'ip': how many leading octets never change (the learner may get them filled in). */
  fixed: number;
}

export interface SubnetTask {
  mode: SubnetMode;
  prompt: Line[];
  fields: SubnetField[];
  steps: Line[];
}

const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
const k = (key: string, v?: Record<string, string | number>): Line => (v ? { k: key, v } : { k: key });
const tex = (s: string): Line => ({ tex: s });
const mono = (s: string): Line => ({ mono: s });

// ---------- Address arithmetic ----------

const toInt = (o: number[]): number => ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
const toOct = (n: number): number[] => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const maskInt = (prefix: number): number => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);
export const ipText = (o: number[]): string => o.join('.');

export function subnetInfo(ip: number[], prefix: number) {
  const m = maskInt(prefix);
  const net = (toInt(ip) & m) >>> 0;
  const bc = (net | (~m >>> 0)) >>> 0;
  return {
    mask: toOct(m),
    net: toOct(net),
    bc: toOct(bc),
    first: toOct(net + 1),
    last: toOct(bc - 1),
    hosts: 2 ** (32 - prefix) - 2
  };
}

/** 32 bits in dotted groups with a bar between the network part and the host part. */
export function bitsSplit(o: number[], prefix: number): string {
  const bits = o.map((x) => x.toString(2).padStart(8, '0')).join('');
  let out = '';
  for (let i = 0; i < 32; i++) {
    if (i === prefix) out += '|';
    else if (i > 0 && i % 8 === 0) out += '.';
    out += bits[i];
  }
  return out;
}

/** Leading octets that are network bits only (never change inside the subnet), at least one octet is left to fill. */
const fixedOctets = (prefix: number): number => Math.min(3, Math.floor(prefix / 8));

function randomIp(rng: Rng): number[] {
  const kind = int(rng, 0, 2);
  if (kind === 0) return [192, 168, int(rng, 0, 255), int(rng, 1, 254)];
  if (kind === 1) return [10, int(rng, 0, 255), int(rng, 0, 255), int(rng, 1, 254)];
  return [172, int(rng, 16, 31), int(rng, 0, 255), int(rng, 1, 254)];
}

/** A prefix with something to work out in an octet that is not all-ones or all-zeros. */
function prefixFor(rng: Rng, level: Level): number {
  const p = level === 1 ? int(rng, 25, 30) : level === 2 ? int(rng, 16, 30) : int(rng, 9, 30);
  return p % 8 === 0 ? p + 1 : p;
}

// ---------- Worked solutions ----------

function networkSteps(ip: number[], prefix: number): Line[] {
  const info = subnetInfo(ip, prefix);
  return [
    k('subnet.s.and'),
    mono(bitsSplit(ip, prefix)),
    mono(bitsSplit(info.mask, prefix)),
    mono(bitsSplit(info.net, prefix)),
    k('subnet.s.network', { net: ipText(info.net) })
  ];
}

function fullSteps(ip: number[], prefix: number): Line[] {
  const info = subnetInfo(ip, prefix);
  const h = 32 - prefix;
  return [
    k('subnet.s.mask', { prefix, mask: ipText(info.mask) }),
    mono(bitsSplit(info.mask, prefix)),
    ...networkSteps(ip, prefix),
    k('subnet.s.broadcast', { h, bc: ipText(info.bc) }),
    mono(bitsSplit(info.bc, prefix)),
    k('subnet.s.firstLast', { first: ipText(info.first), last: ipText(info.last) }),
    k('subnet.s.hosts', { h, total: 2 ** h, hosts: info.hosts }),
    tex(`2^{${h}} - 2 = ${2 ** h} - 2 = ${info.hosts}`)
  ];
}

// ---------- The four kinds ----------

function fullTask(ip: number[], prefix: number, maskGiven: boolean, mode: SubnetMode): SubnetTask {
  const info = subnetInfo(ip, prefix);
  const fixed = fixedOctets(prefix);
  const given = maskGiven ? `${ipText(ip)}  ${ipText(info.mask)}` : `${ipText(ip)}/${prefix}`;
  const ipField = (id: string, o: number[]): SubnetField => ({ id, label: `subnet.f.${id}`, kind: 'ip', answer: ipText(o), fixed });
  return {
    mode,
    prompt: [k('subnet.full.p'), mono(given)],
    fields: [
      maskGiven
        ? { id: 'prefix', label: 'subnet.f.prefix', kind: 'int', answer: String(prefix), fixed: 0 }
        : ipField('mask', info.mask),
      ipField('network', info.net),
      ipField('first', info.first),
      ipField('last', info.last),
      ipField('broadcast', info.bc),
      { id: 'hosts', label: 'subnet.f.hosts', kind: 'int', answer: String(info.hosts), fixed: 0 }
    ],
    steps: fullSteps(ip, prefix)
  };
}

function vlsmTask(rng: Rng, level: Level): SubnetTask {
  const h = level === 1 ? int(rng, 2, 7) : level === 2 ? int(rng, 2, 11) : int(rng, 2, 15);
  // Between "one bit fewer would not hold it" and "just fits": the answer is exactly h host bits.
  const n = int(rng, Math.max(2, 2 ** (h - 1) - 1), 2 ** h - 2);
  const prefix = 32 - h;
  const mask = maskOctets(prefix);
  const hosts = 2 ** h - 2;
  return {
    mode: 'vlsm',
    prompt: [k('subnet.vlsm.p', { n })],
    fields: [
      { id: 'prefix', label: 'subnet.f.prefix', kind: 'int', answer: String(prefix), fixed: 0 },
      { id: 'mask', label: 'subnet.f.mask', kind: 'ip', answer: ipText(mask), fixed: fixedOctets(prefix) },
      { id: 'hosts', label: 'subnet.f.hostsInSubnet', kind: 'int', answer: String(hosts), fixed: 0 }
    ],
    steps: [
      k('subnet.s.vlsmNeed', { n, need: n + 2 }),
      k('subnet.s.vlsmBits', { need: n + 2, h, prefix }),
      tex(`2^{${h - 1}} = ${2 ** (h - 1)} < ${n + 2} \\le ${2 ** h} = 2^{${h}}`),
      k('subnet.s.vlsmMask', { prefix, mask: ipText(mask) }),
      mono(bitsSplit(mask, prefix)),
      k('subnet.s.hosts', { h, total: 2 ** h, hosts }),
      tex(`2^{${h}} - 2 = ${hosts}`)
    ]
  };
}

function maskOctets(prefix: number): number[] {
  return toOct(maskInt(prefix));
}

function sameTask(rng: Rng, level: Level): SubnetTask {
  const prefix = prefixFor(rng, level);
  const size = 2 ** (32 - prefix);
  const a = randomIp(rng);
  const netA = (toInt(a) & maskInt(prefix)) >>> 0;
  const same = rng() < 0.5;
  let netB = netA;
  if (!same) {
    const delta = pick(rng, [-2, -1, 1, 2]);
    netB = netA + delta * size;
    if (netB < 0 || netB + size > 2 ** 32) netB = netA + size;
  }
  const b = toOct(netB + int(rng, 1, size - 2));
  const infoA = subnetInfo(a, prefix);
  const infoB = subnetInfo(b, prefix);
  let common = 0;
  while (common < 4 && infoA.net[common] === infoB.net[common]) common++;
  const fixed = Math.min(fixedOctets(prefix), common);
  return {
    mode: 'same',
    prompt: [k('subnet.same.p'), mono(`A  ${ipText(a)}/${prefix}`), mono(`B  ${ipText(b)}/${prefix}`)],
    fields: [
      { id: 'netA', label: 'subnet.f.netA', kind: 'ip', answer: ipText(infoA.net), fixed },
      { id: 'netB', label: 'subnet.f.netB', kind: 'ip', answer: ipText(infoB.net), fixed },
      { id: 'same', label: 'subnet.f.same', kind: 'yesno', answer: same ? 'yes' : 'no', fixed: 0 }
    ],
    steps: [
      ...networkSteps(a, prefix),
      ...networkSteps(b, prefix),
      k(same ? 'subnet.s.compareSame' : 'subnet.s.compareDiff', { a: ipText(infoA.net), b: ipText(infoB.net) })
    ]
  };
}

/** The classic exam tasks: the same ones every time, in a random order. */
export const EXAM_TASKS: { ip: number[]; prefix: number; maskGiven?: boolean }[] = [
  { ip: [192, 168, 10, 77], prefix: 26 },
  { ip: [172, 16, 45, 200], prefix: 20, maskGiven: true },
  { ip: [10, 10, 10, 10], prefix: 28 },
  { ip: [192, 168, 0, 100], prefix: 25 },
  { ip: [10, 0, 0, 5], prefix: 29, maskGiven: true },
  { ip: [172, 20, 130, 17], prefix: 19 },
  { ip: [192, 168, 100, 200], prefix: 27 },
  { ip: [10, 45, 67, 89], prefix: 13 },
  { ip: [172, 31, 255, 1], prefix: 18, maskGiven: true },
  { ip: [192, 168, 5, 130], prefix: 26 },
  { ip: [203, 0, 113, 77], prefix: 29 },
  { ip: [10, 1, 2, 3], prefix: 22 }
];

export function makeSubnetTask(mode: SubnetMode, level: Level, rng: Rng = Math.random): SubnetTask {
  switch (mode) {
    case 'vlsm':
      return vlsmTask(rng, level);
    case 'same':
      return sameTask(rng, level);
    case 'exam': {
      const t = pick(rng, EXAM_TASKS);
      return fullTask(t.ip, t.prefix, !!t.maskGiven, 'exam');
    }
    default: {
      const prefix = prefixFor(rng, level);
      return fullTask(randomIp(rng), prefix, level === 3 && rng() < 0.5, 'full');
    }
  }
}

// ---------- Checking ----------

/** One box. "/26" and "26" both count; thousands dots in "1.022" are ignored. */
export function checkSubnetField(field: SubnetField, given: string): boolean {
  const raw = given.trim();
  if (!raw) return false;
  switch (field.kind) {
    case 'ip': {
      const parts = raw.replace(/\s/g, '').split('.');
      return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p)) && parts.map(Number).join('.') === field.answer;
    }
    case 'int': {
      let s = raw.replace(/^\//, '').replace(/\s/g, '');
      if (/^\d{1,3}([.,']\d{3})+$/.test(s)) s = s.replace(/[.,']/g, '');
      return /^\d+$/.test(s) && Number(s) === Number(field.answer);
    }
    case 'yesno':
      return raw.toLowerCase() === field.answer;
  }
}
