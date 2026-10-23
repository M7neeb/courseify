// A small, safe maths expression parser: numbers, + - * / ^, brackets, |abs|, a few functions and
// constants, and implicit multiplication (2x, 3(x+1), 2pi). No eval, no access to anything else.
// Used to check typed number answers ("3.2*10^-4") and to draw the graph block's functions.

export class ExprError extends Error {}

type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; n: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { t: 'fn'; n: string; a: Node };

const FNS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  lg: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Tok = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };

/** Unicode the learner may type or paste, mapped to plain operators. */
function normalize(src: string): string {
  return src
    .replace(/[−–]/g, '-')
    .replace(/[·×⋅∙]/g, '*')
    .replace(/[÷:]/g, '/')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/\*\*/g, '^');
}

function tokenize(src: string): Tok[] {
  const s = normalize(src);
  if (s.length > 300) throw new ExprError('too long');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) {
      out.push({ k: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(s.slice(i));
    if (id) {
      out.push({ k: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    if ('+-*/^()|'.includes(c)) {
      out.push({ k: 'op', v: c });
      i++;
      continue;
    }
    throw new ExprError(`unexpected "${c}"`);
  }
  return out;
}

function parse(src: string, vars: readonly string[]): Node {
  const raw = tokenize(src);
  // "ax" or "xy" written without a times sign: split a name made only of known letters.
  const toks: Tok[] = [];
  for (const tok of raw) {
    if (tok.k === 'id' && !(tok.v in FNS) && !(tok.v in CONSTS) && !vars.includes(tok.v) && tok.v.length > 1 && [...tok.v].every((ch) => vars.includes(ch) || ch === 'e')) {
      for (const ch of tok.v) toks.push({ k: 'id', v: ch });
    } else toks.push(tok);
  }
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.k === 'op' && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`expected "${v}"`);
    pos++;
  };

  function expr(): Node {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const op = (toks[pos++] as { v: '+' | '-' }).v;
      left = { t: 'bin', op, a: left, b: term() };
    }
    return left;
  }
  function term(): Node {
    let left = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = (toks[pos++] as { v: '*' | '/' }).v;
        left = { t: 'bin', op, a: left, b: unary() };
      } else if (peek() && (peek()!.k === 'num' || peek()!.k === 'id' || isOp('('))) {
        left = { t: 'bin', op: '*', a: left, b: power() };
      } else return left;
    }
  }
  function unary(): Node {
    if (isOp('-')) {
      pos++;
      return { t: 'neg', a: unary() };
    }
    if (isOp('+')) {
      pos++;
      return unary();
    }
    return power();
  }
  function power(): Node {
    const base = atom();
    if (isOp('^')) {
      pos++;
      return { t: 'bin', op: '^', a: base, b: unary() };
    }
    return base;
  }
  function atom(): Node {
    const tok = peek();
    if (!tok) throw new ExprError('unexpected end');
    if (tok.k === 'num') {
      pos++;
      return { t: 'num', v: tok.v };
    }
    if (tok.k === 'id') {
      pos++;
      if (tok.v in FNS) {
        if (isOp('(')) {
          pos++;
          const a = expr();
          expect(')');
          return { t: 'fn', n: tok.v, a };
        }
        return { t: 'fn', n: tok.v, a: power() };
      }
      if (vars.includes(tok.v)) return { t: 'var', n: tok.v };
      if (tok.v in CONSTS) return { t: 'num', v: CONSTS[tok.v] };
      throw new ExprError(`unknown name "${tok.v}"`);
    }
    if (isOp('(')) {
      pos++;
      const inner = expr();
      expect(')');
      return inner;
    }
    if (isOp('|')) {
      pos++;
      const inner = expr();
      expect('|');
      return { t: 'fn', n: 'abs', a: inner };
    }
    throw new ExprError(`unexpected "${tok.v}"`);
  }

  if (!toks.length) throw new ExprError('empty');
  const tree = expr();
  if (pos < toks.length) throw new ExprError(`unexpected "${toks[pos].v}"`);
  return tree;
}

function run(node: Node, scope: Record<string, number>): number {
  switch (node.t) {
    case 'num':
      return node.v;
    case 'var':
      return scope[node.n] ?? NaN;
    case 'neg':
      return -run(node.a, scope);
    case 'fn':
      return FNS[node.n](run(node.a, scope));
    case 'bin': {
      const a = run(node.a, scope);
      const b = run(node.b, scope);
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '^':
          return Math.pow(a, b);
      }
    }
  }
}

/** Compiles an expression over the given variable names; throws ExprError when it does not parse. */
export function compile(src: string, vars: readonly string[] = []): (scope?: Record<string, number>) => number {
  const tree = parse(src, vars);
  return (scope = {}) => run(tree, scope);
}

/** The value of an expression without variables, or NaN when it does not parse. */
export function evaluate(src: string): number {
  try {
    return compile(src)();
  } catch {
    return NaN;
  }
}

/** The letters an expression uses besides x and the built-in names: "ax^2 + b" uses a and b. */
export function freeLetters(src: string): string[] {
  const out = new Set<string>();
  for (const name of normalize(src).match(/[a-zA-Z_][a-zA-Z_0-9]*/g) ?? []) {
    if (name in FNS || name in CONSTS) continue;
    for (const ch of name) if (/[a-zA-Z]/.test(ch) && ch !== 'x' && ch !== 'e') out.add(ch);
  }
  return [...out].sort();
}
