// Small IT security helpers for the security course: a password strength estimate and a hash
// comparison. The estimate is a teaching model (length and character kinds, plus the usual traps),
// not a guarantee. Nothing typed here ever leaves the device.

const COMMON = new Set([
  'password', 'passwort', '123456', '12345678', '123456789', 'qwerty', 'qwertz', 'abc123', 'letmein', 'welcome', 'monkey', 'dragon',
  'iloveyou', 'admin', 'login', 'princess', 'sunshine', 'master', 'hallo', 'hallo123', 'test', 'test123', 'passw0rd', 'football', 'fussball',
  'schalke04', 'bayern', 'sommer', 'winter', 'geheim', 'trustno1', 'starwars', ' 111111', '000000', 'zaq12wsx', '1q2w3e4r', 'password1'
]);

export type StrengthLabel = 'veryWeak' | 'weak' | 'fair' | 'strong' | 'veryStrong';
export type StrengthIssue = 'short' | 'common' | 'onlyOneKind' | 'sequence' | 'repeat' | 'looksLikeWord';

export interface Strength {
  /** Size of the alphabet the characters seem to come from. */
  pool: number;
  /** Rough entropy in bits: length times log2 of the pool, lowered for the typical traps. */
  bits: number;
  label: StrengthLabel;
  issues: StrengthIssue[];
  /** Guesses until found at one billion per second (an offline attack on a fast hash), in seconds. */
  seconds: number;
}

export function charPool(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  return pool;
}

const hasSequence = (pw: string): boolean => {
  const s = pw.toLowerCase();
  let run = 1;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    run = d === 1 || d === -1 ? run + 1 : 1;
    if (run >= 4) return true;
  }
  return /qwert|asdf|yxcv|qwertz/.test(s);
};

const hasRepeat = (pw: string): boolean => /(.)\1{2,}/.test(pw) || /^(.{1,3})\1+$/.test(pw);

export function passwordStrength(pw: string): Strength {
  const pool = charPool(pw);
  const issues: StrengthIssue[] = [];
  if (pw.length === 0) return { pool: 0, bits: 0, label: 'veryWeak', issues: ['short'], seconds: 0 };
  let bits = pw.length * Math.log2(Math.max(pool, 2));
  const lower = pw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (pw.length < 12) issues.push('short');
  if (COMMON.has(pw.toLowerCase().trim()) || COMMON.has(lower)) {
    issues.push('common');
    bits = Math.min(bits, 10);
  }
  if ([/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length === 1) issues.push('onlyOneKind');
  if (hasSequence(pw)) {
    issues.push('sequence');
    bits *= 0.6;
  }
  if (hasRepeat(pw)) {
    issues.push('repeat');
    bits *= 0.6;
  }
  if (/^[a-zA-Z]+\d{0,4}[!?.]?$/.test(pw) && pw.length <= 12) {
    issues.push('looksLikeWord');
    bits *= 0.75;
  }
  const rounded = Math.max(0, Math.round(bits));
  const label: StrengthLabel = rounded < 28 ? 'veryWeak' : rounded < 40 ? 'weak' : rounded < 60 ? 'fair' : rounded < 80 ? 'strong' : 'veryStrong';
  const seconds = 2 ** Math.max(0, rounded - 1) / 1e9;
  return { pool, bits: rounded, label, issues, seconds };
}

/** A time span in words: "under a second", "3 hours", "400 years", "billions of years". */
export function spanParts(seconds: number): { unit: 'instant' | 'seconds' | 'minutes' | 'hours' | 'days' | 'years' | 'huge'; n: number } {
  if (seconds < 1) return { unit: 'instant', n: 0 };
  if (seconds < 60) return { unit: 'seconds', n: Math.round(seconds) };
  if (seconds < 3600) return { unit: 'minutes', n: Math.round(seconds / 60) };
  if (seconds < 86400) return { unit: 'hours', n: Math.round(seconds / 3600) };
  if (seconds < 86400 * 365) return { unit: 'days', n: Math.round(seconds / 86400) };
  const years = seconds / (86400 * 365);
  return years > 1e9 ? { unit: 'huge', n: 0 } : { unit: 'years', n: Math.round(years) };
}

// ---------- hashes ----------

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** How many bits differ between two hex strings of the same length. */
export function bitDiff(a: string, b: string): number {
  if (a.length !== b.length) return 0;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      diff += x & 1;
      x >>= 1;
    }
  }
  return diff;
}
