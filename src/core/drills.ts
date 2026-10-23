// Generated practice: endless IT and networks drills (number systems, units, subnets) and maths
// drills (equations, percent, fractions, ...). Every problem comes with a worked solution, step by
// step. Text is stored as i18n keys plus values, so the same problem reads in English and German.

import { evaluate } from './expr.ts';

export type DrillGroup = 'it' | 'maths';
export type AnswerType = 'int' | 'number' | 'bin' | 'hex' | 'ip' | 'fraction' | 'set';
export type Level = 1 | 2 | 3;

/** One line of a prompt or a solution: UI text by key, a formula, or fixed-width text (bits, addresses). */
export type Line = { k: string; v?: Record<string, string | number> } | { tex: string } | { mono: string };

export interface DrillProblem {
  drill: string;
  prompt: Line[];
  /** The answer as it is shown ("192.168.1.64", "7/12", "1011"). */
  answer: string;
  type: AnswerType;
  /** Shown after the answer field ("s", "MiB", "V"). */
  unit?: string;
  steps: Line[];
  /** For 'number': the largest difference still counted as right. */
  tolerance?: number;
}

type Made = Omit<DrillProblem, 'drill'>;
export type Rng = () => number;

export interface DrillDef {
  id: string;
  group: DrillGroup;
  make(rng: Rng, level: Level): Made;
}

// ---------- Random helpers ----------

/** A seeded random source (mulberry32), so tests can repeat a problem. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number): number => Math.abs(a * b) / gcd(a, b);
/** A number without float noise: 0.1 + 0.2 shows as 0.3. */
const num = (x: number): string => String(Number(x.toPrecision(12)));
const k = (key: string, v?: Record<string, string | number>): Line => (v ? { k: key, v } : { k: key });
const tex = (s: string): Line => ({ tex: s });
const mono = (s: string): Line => ({ mono: s });

// ---------- Number systems ----------

const HEX = '0123456789ABCDEF';

function divisionSteps(n: number, base: number): Line[] {
  const lines: Line[] = [];
  let q = n;
  while (q > 0) {
    const r = q % base;
    const next = Math.floor(q / base);
    lines.push(k('drill.s.divRem', { n: q, d: base, q: next, r: base === 16 && r > 9 ? `${r} = ${HEX[r]}` : r }));
    q = next;
  }
  return lines;
}

const RANGES: Record<Level, [number, number]> = { 1: [16, 255], 2: [256, 4095], 3: [4096, 65535] };

const binDec: DrillDef = {
  id: 'bin-dec',
  group: 'it',
  make(rng, level) {
    const bits = level === 1 ? 4 : level === 2 ? 6 : 8;
    const n = int(rng, 2 ** (bits - 1), 2 ** bits - 1);
    const bin = n.toString(2);
    const ones = [...bin].map((d, i) => (d === '1' ? 2 ** (bin.length - 1 - i) : 0)).filter(Boolean);
    return {
      prompt: [k('drill.binDec.p'), mono(bin)],
      answer: String(n),
      type: 'int',
      steps: [k('drill.s.placeValues'), mono([...bin].map((d, i) => `${d}·${2 ** (bin.length - 1 - i)}`).join('  ')), tex(`${ones.join(' + ')} = ${n}`)]
    };
  }
};

const decBin: DrillDef = {
  id: 'dec-bin',
  group: 'it',
  make(rng, level) {
    const n = level === 1 ? int(rng, 2, 15) : level === 2 ? int(rng, 16, 63) : int(rng, 64, 255);
    const bin = n.toString(2);
    return {
      prompt: [k('drill.decBin.p', { n })],
      answer: bin,
      type: 'bin',
      steps: [k('drill.s.divideBy', { d: 2 }), ...divisionSteps(n, 2), k('drill.s.readUp', { answer: bin })]
    };
  }
};

const hexDec: DrillDef = {
  id: 'hex-dec',
  group: 'it',
  make(rng, level) {
    const [lo, hi] = RANGES[level];
    const n = int(rng, lo, hi);
    const hex = n.toString(16).toUpperCase();
    const parts = [...hex].map((d, i) => `${HEX.indexOf(d)} \\cdot ${16 ** (hex.length - 1 - i)}`);
    return {
      prompt: [k('drill.hexDec.p'), mono(hex)],
      answer: String(n),
      type: 'int',
      steps: [k('drill.s.hexDigits'), k('drill.s.hexPlaces'), tex(`${parts.join(' + ')} = ${n}`)]
    };
  }
};

const decHex: DrillDef = {
  id: 'dec-hex',
  group: 'it',
  make(rng, level) {
    const [lo, hi] = RANGES[level];
    const n = int(rng, lo, hi);
    const hex = n.toString(16).toUpperCase();
    return {
      prompt: [k('drill.decHex.p', { n })],
      answer: hex,
      type: 'hex',
      steps: [k('drill.s.divideBy', { d: 16 }), ...divisionSteps(n, 16), k('drill.s.readUp', { answer: hex })]
    };
  }
};

const binHex: DrillDef = {
  id: 'bin-hex',
  group: 'it',
  make(rng, level) {
    const bits = level === 1 ? 8 : level === 2 ? 12 : 16;
    const n = int(rng, 2 ** (bits - 4), 2 ** bits - 1);
    const bin = n.toString(2).padStart(bits, '0');
    const hex = n.toString(16).toUpperCase().padStart(bits / 4, '0');
    const nibbles = bin.match(/.{4}/g)!;
    const map = nibbles.map((nb) => `${nb} = ${HEX[parseInt(nb, 2)]}`).join('   ');
    if (rng() < 0.5) {
      return {
        prompt: [k('drill.binHex.p'), mono(nibbles.join(' '))],
        answer: hex,
        type: 'hex',
        steps: [k('drill.s.nibbles'), mono(map), k('drill.s.together', { answer: hex })]
      };
    }
    return {
      prompt: [k('drill.hexBin.p'), mono(hex)],
      answer: bin,
      type: 'bin',
      steps: [k('drill.s.nibblesBack'), mono(map), k('drill.s.together', { answer: nibbles.join(' ') })]
    };
  }
};

// ---------- Units and transfer times ----------

interface UnitTask {
  from: string;
  to: string;
  factor: number;
  /** true: multiply by the factor, false: divide. */
  up: boolean;
  make(rng: Rng): number;
}

const UNIT_TASKS: Record<Level, UnitTask[]> = {
  1: [
    { from: 'GiB', to: 'MiB', factor: 1024, up: true, make: (r) => int(r, 1, 16) },
    { from: 'GB', to: 'MB', factor: 1000, up: true, make: (r) => int(r, 1, 40) / 2 },
    { from: 'TB', to: 'GB', factor: 1000, up: true, make: (r) => int(r, 1, 8) },
    { from: 'Byte', to: 'Bit', factor: 8, up: true, make: (r) => int(r, 2, 64) }
  ],
  2: [
    { from: 'MiB', to: 'KiB', factor: 1024, up: true, make: (r) => int(r, 2, 32) },
    { from: 'MB', to: 'GB', factor: 1000, up: false, make: (r) => int(r, 2, 36) * 250 },
    { from: 'MB', to: 'Mbit', factor: 8, up: true, make: (r) => int(r, 2, 125) },
    { from: 'Mbit', to: 'MB', factor: 8, up: false, make: (r) => int(r, 1, 125) * 8 },
    { from: 'KiB', to: 'Byte', factor: 1024, up: true, make: (r) => int(r, 2, 16) }
  ],
  3: [
    { from: 'GiB', to: 'KiB', factor: 1024 * 1024, up: true, make: (r) => int(r, 1, 8) },
    { from: 'MiB', to: 'GiB', factor: 1024, up: false, make: (r) => int(r, 1, 32) * 512 },
    { from: 'Gbit', to: 'MB', factor: 8, up: false, make: (r) => int(r, 1, 10) },
    { from: 'GB', to: 'GiB', factor: 1000 ** 3 / 1024 ** 3, up: true, make: (r) => int(r, 1, 20) * 50 }
  ]
};

const units: DrillDef = {
  id: 'units',
  group: 'it',
  make(rng, level) {
    const pool = [...UNIT_TASKS[1], ...(level >= 2 ? UNIT_TASKS[2] : []), ...(level >= 3 ? UNIT_TASKS[3] : [])];
    const task = pick(rng, pool);
    const x = task.make(rng);
    if (task.from === 'Gbit') {
      // Gbit to MB: × 1000, then ÷ 8.
      const value = (x * 1000) / 8;
      return {
        prompt: [k('drill.units.p', { x: num(x), from: task.from, to: task.to })],
        answer: num(value),
        type: 'number',
        unit: task.to,
        steps: [k('drill.s.unitGiga'), tex(`${num(x)}\\,\\text{Gbit} = ${num(x * 1000)}\\,\\text{Mbit}`), k('drill.s.unitBits'), tex(`${num(x * 1000)} : 8 = ${num(value)}\\,\\text{MB}`)]
      };
    }
    if (task.from === 'GB' && task.to === 'GiB') {
      const value = x * task.factor;
      return {
        prompt: [k('drill.units.p', { x: num(x), from: task.from, to: task.to }), k('drill.units.round')],
        answer: value.toFixed(2),
        type: 'number',
        unit: task.to,
        tolerance: 0.006,
        steps: [k('drill.s.unitGiB'), tex(`${x} \\cdot 1000^3\\,\\text{Byte} = ${x * 1000 ** 3}\\,\\text{Byte}`), tex(`${x * 1000 ** 3} : 1024^3 \\approx ${value.toFixed(2)}\\,\\text{GiB}`)]
      };
    }
    const value = task.up ? x * task.factor : x / task.factor;
    const op = task.up ? '\\cdot' : ':';
    return {
      prompt: [k('drill.units.p', { x: num(x), from: task.from, to: task.to })],
      answer: num(value),
      type: 'number',
      unit: task.to,
      steps: [k(task.factor === 8 ? 'drill.s.unitBits' : task.factor % 1024 === 0 ? 'drill.s.unitBinary' : 'drill.s.unitDecimal', { factor: task.factor }), k(task.up ? 'drill.s.unitUp' : 'drill.s.unitDown', { from: task.from, to: task.to }), tex(`${num(x)} ${op} ${task.factor} = ${num(value)}\\,\\text{${task.to}}`)]
    };
  }
};

const RATES = [8, 10, 16, 20, 25, 40, 50, 100, 200, 250, 500, 1000];

const transfer: DrillDef = {
  id: 'transfer',
  group: 'it',
  make(rng, level) {
    const rate = pick(rng, level === 1 ? RATES.slice(0, 7) : RATES);
    let secs = int(rng, 2, level === 3 ? 900 : 120);
    while ((secs * rate) % 8 !== 0) secs++;
    const size = (secs * rate) / 8;
    const big = level === 3 && size >= 1000 && size % 1000 === 0;
    const sizeText = big ? `${size / 1000} GB` : `${size} MB`;
    return {
      prompt: [k('drill.transfer.p', { size: sizeText, rate: `${rate} Mbit/s` })],
      answer: String(secs),
      type: 'number',
      unit: 's',
      steps: [
        ...(big ? [tex(`${size / 1000}\\,\\text{GB} = ${size}\\,\\text{MB}`)] : []),
        k('drill.s.toBits'),
        tex(`${size}\\,\\text{MB} \\cdot 8 = ${size * 8}\\,\\text{Mbit}`),
        k('drill.s.divideRate'),
        tex(`t = \\frac{${size * 8}\\,\\text{Mbit}}{${rate}\\,\\text{Mbit/s}} = ${secs}\\,\\text{s}`)
      ]
    };
  }
};

// ---------- Subnets ----------

const ipText = (o: number[]): string => o.join('.');
function maskOctets(prefix: number): number[] {
  return [0, 1, 2, 3].map((i) => {
    const bits = Math.max(0, Math.min(8, prefix - i * 8));
    return bits === 0 ? 0 : (0xff << (8 - bits)) & 0xff;
  });
}
const maskBits = (prefix: number): string => '1'.repeat(prefix).padEnd(32, '0').match(/.{8}/g)!.join('.');

function randomIp(rng: Rng): number[] {
  const kind = int(rng, 0, 2);
  if (kind === 0) return [192, 168, int(rng, 0, 255), int(rng, 1, 254)];
  if (kind === 1) return [10, int(rng, 0, 255), int(rng, 0, 255), int(rng, 1, 254)];
  return [172, int(rng, 16, 31), int(rng, 0, 255), int(rng, 1, 254)];
}

const prefixFor = (rng: Rng, level: Level): number => (level === 1 ? int(rng, 24, 30) : level === 2 ? int(rng, 16, 30) : int(rng, 9, 30));

const cidr: DrillDef = {
  id: 'cidr',
  group: 'it',
  make(rng, level) {
    const prefix = level === 1 ? pick(rng, [8, 16, 24, 25, 26, 27, 28]) : level === 2 ? int(rng, 16, 30) : int(rng, 9, 30);
    const mask = maskOctets(prefix);
    const i = Math.min(3, Math.floor(prefix / 8));
    const octet = mask[i];
    const octetBits = maskBits(prefix).split('.')[i];
    const valueParts = [...octetBits].map((b, j) => (b === '1' ? 128 >> j : 0)).filter(Boolean);
    const octetLine = octet === 0 || octet === 255 ? [] : [tex(`${octetBits} = ${valueParts.join(' + ')} = ${octet}`)];
    if (rng() < 0.5) {
      return {
        prompt: [k('drill.cidrMask.p', { prefix })],
        answer: ipText(mask),
        type: 'ip',
        steps: [k('drill.s.ones', { prefix }), mono(maskBits(prefix)), k('drill.s.octets'), ...octetLine, k('drill.s.together', { answer: ipText(mask) })]
      };
    }
    return {
      prompt: [k('drill.maskCidr.p'), mono(ipText(mask))],
      answer: String(prefix),
      type: 'int',
      steps: [k('drill.s.maskToBits'), mono(maskBits(prefix)), k('drill.s.countOnes', { prefix })]
    };
  }
};

const subnetHosts: DrillDef = {
  id: 'subnet-hosts',
  group: 'it',
  make(rng, level) {
    const prefix = prefixFor(rng, level);
    const h = 32 - prefix;
    const hosts = 2 ** h - 2;
    return {
      prompt: [k('drill.hosts.p', { prefix })],
      answer: String(hosts),
      type: 'int',
      steps: [k('drill.s.hostBits', { h, prefix }), tex(`2^{${h}} = ${2 ** h}`), k('drill.s.minus2'), tex(`${2 ** h} - 2 = ${hosts}`)]
    };
  }
};

function subnetMath(ip: number[], prefix: number) {
  const mask = maskOctets(prefix);
  const i = Math.min(3, Math.floor(prefix / 8));
  const block = 256 - mask[i];
  const net = ip.map((o, j) => (j < i ? o : j === i ? Math.floor(o / block) * block : 0));
  const bc = net.map((o, j) => (j < i ? o : j === i ? o + block - 1 : 255));
  return { mask, i, block, net, bc };
}

function subnetDef(id: 'subnet-network' | 'subnet-broadcast'): DrillDef {
  return {
    id,
    group: 'it',
    make(rng, level) {
      let prefix = prefixFor(rng, level);
      if (prefix % 8 === 0) prefix += 1;
      const ip = randomIp(rng);
      const { mask, i, block, net, bc } = subnetMath(ip, prefix);
      const network = id === 'subnet-network';
      const answer = ipText(network ? net : bc);
      return {
        prompt: [k(network ? 'drill.network.p' : 'drill.broadcast.p'), mono(`${ipText(ip)}/${prefix}`)],
        answer,
        type: 'ip',
        steps: [
          k('drill.s.mask', { mask: ipText(mask) }),
          k('drill.s.interesting', { n: i + 1, octet: mask[i] }),
          tex(`256 - ${mask[i]} = ${block}`),
          k('drill.s.blockSize', { block }),
          tex(`\\left\\lfloor \\frac{${ip[i]}}{${block}} \\right\\rfloor = ${Math.floor(ip[i] / block)} \\;\\Rightarrow\\; ${Math.floor(ip[i] / block)} \\cdot ${block} = ${net[i]}`),
          ...(network ? [k('drill.s.netRest')] : [k('drill.s.bcLast', { from: net[i], to: bc[i] }), k('drill.s.bcRest')]),
          k('drill.s.together', { answer })
        ]
      };
    }
  };
}

// ---------- Maths ----------

/** "3x", "-x", "x" for a coefficient. */
const coef = (a: number, v = 'x'): string => (a === 1 ? v : a === -1 ? `-${v}` : `${a}${v}`);
/** " + 5", " - 5", "" for a constant added on. */
const plus = (b: number): string => (b === 0 ? '' : b > 0 ? ` + ${b}` : ` - ${-b}`);
/** " + 6x", " - x", "" for a linear term. */
const linTerm = (c: number): string => (c === 0 ? '' : c === 1 ? ' + x' : c === -1 ? ' - x' : `${plus(c)}x`);
/** A negative number in brackets, so "5 - (-3)" reads right. */
const par = (n: number): string => (n < 0 ? `(${n})` : String(n));
const nonZero = (rng: Rng, lo: number, hi: number): number => {
  let v = 0;
  while (v === 0) v = int(rng, lo, hi);
  return v;
};

const linear: DrillDef = {
  id: 'linear',
  group: 'maths',
  make(rng, level) {
    const x = int(rng, -10, 10);
    if (level === 1) {
      const b = nonZero(rng, -20, 20);
      return {
        prompt: [k('drill.linear.p'), tex(`x${plus(b)} = ${x + b}`)],
        answer: String(x),
        type: 'int',
        steps: [k(b > 0 ? 'drill.s.subtractBoth' : 'drill.s.addBoth', { n: Math.abs(b) }), tex(`x = ${x + b}${plus(-b)} = ${x}`)]
      };
    }
    let a = nonZero(rng, -9, 9);
    if (a === 1) a = 2;
    const b = int(rng, -20, 20);
    if (level === 2) {
      const c = a * x + b;
      return {
        prompt: [k('drill.linear.p'), tex(`${coef(a)}${plus(b)} = ${c}`)],
        answer: String(x),
        type: 'int',
        steps: [
          ...(b !== 0 ? [k(b > 0 ? 'drill.s.subtractBoth' : 'drill.s.addBoth', { n: Math.abs(b) }), tex(`${coef(a)} = ${c - b}`)] : []),
          k('drill.s.divideBoth', { n: a }),
          tex(`x = \\frac{${c - b}}{${a}} = ${x}`)
        ]
      };
    }
    let c = nonZero(rng, -9, 9);
    if (c === a) c = a + 1 === 0 ? a + 2 : a + 1;
    const d = (a - c) * x + b;
    return {
      prompt: [k('drill.linear.p'), tex(`${coef(a)}${plus(b)} = ${coef(c)}${plus(d)}`)],
      answer: String(x),
      type: 'int',
      steps: [
        k('drill.s.collectX', { term: coef(c) }),
        tex(`${coef(a - c)}${plus(b)} = ${d}`),
        ...(b !== 0 ? [k(b > 0 ? 'drill.s.subtractBoth' : 'drill.s.addBoth', { n: Math.abs(b) }), tex(`${coef(a - c)} = ${d - b}`)] : []),
        ...(a - c !== 1 ? [k('drill.s.divideBoth', { n: a - c }), tex(`x = \\frac{${d - b}}{${a - c}} = ${x}`)] : [])
      ]
    };
  }
};

const PERCENTS = [5, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 80, 120, 150];

const percent: DrillDef = {
  id: 'percent',
  group: 'maths',
  make(rng, level) {
    let p = 0;
    let base = 0;
    do {
      p = pick(rng, level === 1 ? [10, 20, 25, 50, 75] : PERCENTS);
      base = level === 1 ? int(rng, 1, 20) * 20 : int(rng, 2, 60) * (level === 3 ? 15 : 10);
    } while ((base * p) % 100 !== 0);
    const part = (base * p) / 100;
    const kind = level === 1 ? 'of' : pick(rng, ['of', 'rate', 'base'] as const);
    if (kind === 'of') {
      return {
        prompt: [k('drill.percent.of', { p, base })],
        answer: String(part),
        type: 'number',
        steps: [k('drill.s.percentOf'), tex(`W = G \\cdot \\frac{p}{100} = ${base} \\cdot \\frac{${p}}{100} = ${part}`)]
      };
    }
    if (kind === 'rate') {
      return {
        prompt: [k('drill.percent.rate', { part, base })],
        answer: String(p),
        type: 'number',
        unit: '%',
        steps: [k('drill.s.percentRate'), tex(`p = \\frac{W}{G} \\cdot 100 = \\frac{${part}}{${base}} \\cdot 100 = ${p}\\,\\%`)]
      };
    }
    return {
      prompt: [k('drill.percent.base', { part, p })],
      answer: String(base),
      type: 'number',
      steps: [k('drill.s.percentBase'), tex(`G = \\frac{W \\cdot 100}{p} = \\frac{${part} \\cdot 100}{${p}} = ${base}`)]
    };
  }
};

const frac = (n: number, d: number): string => {
  const g = gcd(n, d) || 1;
  const sign = n * d < 0 ? -1 : 1;
  const nn = Math.abs(n / g);
  const dd = Math.abs(d / g);
  return dd === 1 ? String(sign * nn) : `${sign < 0 ? '-' : ''}${nn}/${dd}`;
};
const texFrac = (s: string): string => {
  const m = /^(-?)(\d+)\/(\d+)$/.exec(s);
  return m ? `${m[1]}\\frac{${m[2]}}{${m[3]}}` : s;
};

/** The fraction n/d is already written the way the answer is. */
const sameFrac = (n: number, d: number, answer: string): boolean => `${n}/${d}` === answer;

const fractions: DrillDef = {
  id: 'fractions',
  group: 'maths',
  make(rng, level) {
    const b = int(rng, 2, level === 1 ? 9 : 12);
    const d = level === 1 ? b : int(rng, 2, 12);
    const a = int(rng, 1, b - 1);
    const c = int(rng, 1, d - 1);
    const op = level === 3 ? pick(rng, ['-', '*', '/'] as const) : '+';
    const shown = `\\frac{${a}}{${b}} ${op === '*' ? '\\cdot' : op === '/' ? ':' : op} \\frac{${c}}{${d}}`;
    const prompt = [k('drill.fractions.p'), tex(shown)];
    if (op === '*' || op === '/') {
      const [n2, d2] = op === '*' ? [c, d] : [d, c];
      const answer = frac(a * n2, b * d2);
      return {
        prompt,
        answer,
        type: 'fraction',
        steps: [
          ...(op === '/' ? [k('drill.s.fracDivide'), tex(`\\frac{${a}}{${b}} \\cdot \\frac{${n2}}{${d2}}`)] : []),
          k('drill.s.fracMultiply'),
          tex(`\\frac{${a} \\cdot ${n2}}{${b} \\cdot ${d2}} = \\frac{${a * n2}}{${b * d2}}${sameFrac(a * n2, b * d2, answer) ? '' : ` = ${texFrac(answer)}`}`),
          k('drill.s.fracReduce')
        ]
      };
    }
    const m = lcm(b, d);
    const top = op === '+' ? (a * m) / b + (c * m) / d : (a * m) / b - (c * m) / d;
    const answer = frac(top, m);
    return {
      prompt,
      answer,
      type: 'fraction',
      steps: [
        ...(b !== d ? [k('drill.s.fracCommon', { m }), tex(`\\frac{${(a * m) / b}}{${m}} ${op} \\frac{${(c * m) / d}}{${m}}`)] : []),
        k('drill.s.fracAdd'),
        tex(`\\frac{${top}}{${m}}${sameFrac(top, m, answer) ? '' : ` = ${texFrac(answer)}`}`),
        k('drill.s.fracReduce')
      ]
    };
  }
};

/** Moves the decimal point of a digit string: digits "32" with the point after 1 digit, times 10^e. */
function decimalOf(digits: string, e: number): string {
  const point = 1 + e;
  let s: string;
  if (point <= 0) s = `0.${'0'.repeat(-point)}${digits}`;
  else if (point >= digits.length) s = digits + '0'.repeat(point - digits.length);
  else s = `${digits.slice(0, point)}.${digits.slice(point)}`;
  return s;
}

const scientific: DrillDef = {
  id: 'scientific',
  group: 'maths',
  make(rng, level) {
    const digits = `${int(rng, 1, 9)}${level === 1 ? '' : int(rng, 1, 9)}${level === 3 ? int(rng, 1, 9) : ''}`;
    const e = level === 1 ? int(rng, 2, 6) : int(rng, -6, 8) || -3;
    const mantissa = digits.length === 1 ? digits : `${digits[0]}.${digits.slice(1)}`;
    const plain = decimalOf(digits, e);
    return {
      prompt: [k('drill.scientific.p'), tex(`${plain} = ${mantissa} \\cdot 10^{\\,?}`)],
      answer: String(e),
      type: 'int',
      steps: [k(e >= 0 ? 'drill.s.pointLeft' : 'drill.s.pointRight', { n: Math.abs(e) }), tex(`${plain} = ${mantissa} \\cdot 10^{${e}}`)]
    };
  }
};

const ohm: DrillDef = {
  id: 'ohm',
  group: 'maths',
  make(rng, level) {
    const milli = level >= 2;
    const r = milli ? pick(rng, [1, 1.5, 2, 2.2, 3.3, 4.7, 5, 10, 12, 22, 47]) : int(rng, 2, 60);
    const i = milli ? int(rng, 1, 25) : int(rng, 1, 10);
    const u = Number((r * i).toPrecision(10));
    const rU = milli ? 'kΩ' : 'Ω';
    const iU = milli ? 'mA' : 'A';
    const rT = milli ? '\\text{k}\\Omega' : '\\Omega';
    const iT = milli ? '\\text{mA}' : '\\text{A}';
    const find = level === 1 ? pick(rng, ['U', 'I'] as const) : pick(rng, ['U', 'R', 'I'] as const);
    const note = milli ? [k('drill.s.ohmMilli')] : [];
    if (find === 'U') {
      return {
        prompt: [k('drill.ohm.U', { r: `${num(r)} ${rU}`, i: `${i} ${iU}` })],
        answer: num(u),
        type: 'number',
        unit: 'V',
        steps: [k('drill.s.ohmLaw'), tex('U = R \\cdot I'), ...note, tex(`U = ${num(r)}\\,${rT} \\cdot ${i}\\,${iT} = ${num(u)}\\,\\text{V}`)]
      };
    }
    if (find === 'I') {
      return {
        prompt: [k('drill.ohm.I', { u: `${num(u)} V`, r: `${num(r)} ${rU}` })],
        answer: String(i),
        type: 'number',
        unit: iU,
        steps: [k('drill.s.ohmLaw'), tex('U = R \\cdot I \\;\\Rightarrow\\; I = \\frac{U}{R}'), ...note, tex(`I = \\frac{${num(u)}\\,\\text{V}}{${num(r)}\\,${rT}} = ${i}\\,${iT}`)]
      };
    }
    return {
      prompt: [k('drill.ohm.R', { u: `${num(u)} V`, i: `${i} ${iU}` })],
      answer: num(r),
      type: 'number',
      unit: rU,
      steps: [k('drill.s.ohmLaw'), tex('U = R \\cdot I \\;\\Rightarrow\\; R = \\frac{U}{I}'), ...note, tex(`R = \\frac{${num(u)}\\,\\text{V}}{${i}\\,${iT}} = ${num(r)}\\,${rT}`)]
    };
  }
};

const quadratic: DrillDef = {
  id: 'quadratic',
  group: 'maths',
  make(rng, level) {
    const r1 = int(rng, -9, 9);
    const r2 = level === 1 ? -r1 || 3 : int(rng, -9, 9);
    const p = -(r1 + r2);
    const q = r1 * r2;
    const a = level === 3 ? pick(rng, [2, 3, -2]) : 1;
    const shown = `${a === 1 ? '' : a === -1 ? '-' : a}x^2${linTerm(a * p)}${plus(a * q)} = 0`;
    const roots = [...new Set([r1, r2])].sort((m, n) => m - n);
    const half = -p / 2;
    const disc = half * half - q;
    return {
      prompt: [k('drill.quadratic.p'), tex(shown)],
      answer: roots.join(', '),
      type: 'set',
      steps: [
        ...(a !== 1 ? [k('drill.s.divideBoth', { n: a }), tex(`x^2${linTerm(p)}${plus(q)} = 0`)] : []),
        k('drill.s.pq', { p, q }),
        tex('x_{1,2} = -\\frac{p}{2} \\pm \\sqrt{\\left(\\frac{p}{2}\\right)^2 - q}'),
        tex(`x_{1,2} = ${num(half)} \\pm \\sqrt{${num(disc)}}`),
        tex(`x_{1,2} = ${num(half)} \\pm ${num(Math.sqrt(disc))}`),
        k(roots.length === 1 ? 'drill.s.oneRoot' : 'drill.s.twoRoots', { answer: roots.join(', ') })
      ]
    };
  }
};

const line: DrillDef = {
  id: 'line',
  group: 'maths',
  make(rng, level) {
    const m = nonZero(rng, -5, 5);
    const b = int(rng, -8, 8);
    const x1 = int(rng, -6, 5);
    const x2 = x1 + int(rng, 1, 5);
    const y1 = m * x1 + b;
    const y2 = m * x2 + b;
    const points = `P(${x1} \\mid ${y1}),\\; Q(${x2} \\mid ${y2})`;
    const slopeSteps = [k('drill.s.slope'), tex(`m = \\frac{y_2 - y_1}{x_2 - x_1} = \\frac{${y2} - ${par(y1)}}{${x2} - ${par(x1)}} = \\frac{${y2 - y1}}{${x2 - x1}} = ${m}`)];
    if (level === 1) {
      return { prompt: [k('drill.line.m'), tex(points)], answer: String(m), type: 'int', steps: slopeSteps };
    }
    return {
      prompt: [k('drill.line.b'), tex(points)],
      answer: String(b),
      type: 'int',
      steps: [...slopeSteps, k('drill.s.intercept'), tex(`${y1} = ${m} \\cdot ${par(x1)} + b \\;\\Rightarrow\\; b = ${y1} - ${par(m * x1)} = ${b}`)]
    };
  }
};

// ---------- Catalog ----------

export const DRILLS: DrillDef[] = [
  binDec,
  decBin,
  hexDec,
  decHex,
  binHex,
  units,
  transfer,
  cidr,
  subnetHosts,
  subnetDef('subnet-network'),
  subnetDef('subnet-broadcast'),
  linear,
  percent,
  fractions,
  scientific,
  ohm,
  quadratic,
  line
];

export function drillById(id: string): DrillDef | undefined {
  return DRILLS.find((d) => d.id === id);
}

export function makeProblem(id: string, level: Level, rng: Rng = Math.random): DrillProblem | null {
  const def = drillById(id);
  return def ? { drill: id, ...def.make(rng, level) } : null;
}

// ---------- Checking ----------

/** A typed number: "1,5" or "1.5", "3.2*10^-4", "2/3"; a trailing unit is ignored. */
function readNumber(given: string, unit?: string): number {
  let s = given.trim().replace(/^[a-zA-Z]\s*=\s*/, '');
  if (unit) s = s.replace(new RegExp(`\\s*${unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '');
  s = s.replace(/\s*(%|[a-zA-ZΩ]+(\/s)?)$/, (whole, _u, _s, offset: number) => (offset > 0 ? '' : whole));
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (!s.includes('.') && /^-?\d*,\d+$/.test(s)) s = s.replace(',', '.');
  if (!s) return NaN;
  return evaluate(s);
}

const near = (a: number, b: number, tol: number): boolean => Number.isFinite(a) && Math.abs(a - b) <= tol;

export function checkDrillAnswer(problem: DrillProblem, given: string): boolean {
  const raw = given.trim();
  if (!raw) return false;
  switch (problem.type) {
    case 'int':
      return near(readNumber(raw, problem.unit), Number(problem.answer), 1e-9);
    case 'number': {
      const target = Number(problem.answer);
      return near(readNumber(raw, problem.unit), target, problem.tolerance ?? Math.max(1e-9, Math.abs(target) * 1e-9));
    }
    case 'fraction': {
      const [n, d] = problem.answer.split('/').map(Number);
      return near(readNumber(raw), d ? n / d : n, 1e-9);
    }
    case 'bin': {
      const s = raw.replace(/[\s_]/g, '').replace(/^0b/i, '');
      return /^[01]+$/.test(s) && parseInt(s, 2) === parseInt(problem.answer.replace(/\s/g, ''), 2);
    }
    case 'hex': {
      const s = raw.replace(/\s/g, '').replace(/^0x/i, '').replace(/h$/i, '');
      return /^[0-9a-f]+$/i.test(s) && parseInt(s, 16) === parseInt(problem.answer, 16);
    }
    case 'ip': {
      const parts = raw.replace(/\s/g, '').split('.');
      return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p)) && parts.map(Number).join('.') === problem.answer;
    }
    case 'set': {
      const want = problem.answer.split(',').map(Number);
      const got = raw
        .replace(/x\s*_?\s*\d\s*=/gi, '')
        .split(/[;,]|\s+(?:and|und|oder|or)\s+/i)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => readNumber(p));
      const unique = [...new Set(got.map((g) => Math.round(g * 1e9) / 1e9))];
      return unique.length === want.length && want.every((w) => unique.some((g) => near(g, w, 1e-9)));
    }
  }
}
