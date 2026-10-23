import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate } from './expr.ts';
import { DRILLS, checkDrillAnswer, makeProblem, seededRng, type DrillProblem, type Level } from './drills.ts';

test('expressions: operators, precedence, functions and implicit multiplication', () => {
  assert.equal(evaluate('1 + 2 * 3'), 7);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('2^-1'), 0.5);
  assert.equal(evaluate('3.2*10^-4'), 0.00032);
  assert.equal(evaluate('3,2'), NaN);
  assert.equal(evaluate('3.2e-4'), 0.00032);
  assert.equal(evaluate('|-3| + sqrt(16)'), 7);
  assert.equal(evaluate('2pi'), 2 * Math.PI);
  assert.equal(evaluate('7 ÷ 2'), 3.5);
  assert.equal(evaluate('3 · 4 − 1'), 11);
  assert.ok(Number.isNaN(evaluate('alert(1)')));
  assert.ok(Number.isNaN(evaluate('2 +')));
  assert.ok(Number.isNaN(evaluate('')));
  const f = compile('a*x^2 + bx + 1', ['x', 'a', 'b']);
  assert.equal(f({ x: 2, a: 3, b: 1 }), 15);
  assert.equal(compile('2(x+1)', ['x'])({ x: 4 }), 10);
  assert.equal(compile('sin x', ['x'])({ x: 0 }), 0);
});

test('every drill makes problems whose own answer is accepted, at every level', () => {
  for (const def of DRILLS) {
    for (const level of [1, 2, 3] as Level[]) {
      const rng = seededRng(level * 1000 + def.id.length);
      for (let i = 0; i < 300; i++) {
        const p = makeProblem(def.id, level, rng)!;
        assert.ok(p.prompt.length > 0 && p.steps.length > 0, def.id);
        assert.ok(p.answer && !p.answer.includes('NaN') && !p.answer.includes('Infinity'), `${def.id}: ${p.answer}`);
        assert.ok(checkDrillAnswer(p, p.answer), `${def.id} L${level}: own answer ${p.answer} rejected`);
        // Every key a problem uses exists in the English strings (checked in i18n.test.ts too).
      }
    }
  }
});

const problem = (type: DrillProblem['type'], answer: string, extra: Partial<DrillProblem> = {}): DrillProblem => ({ drill: 'x', prompt: [], steps: [], type, answer, ...extra });

test('answers are read the way people type them', () => {
  assert.ok(checkDrillAnswer(problem('number', '1.5'), '1,5'));
  assert.ok(checkDrillAnswer(problem('number', '24', { unit: 's' }), '24 s'));
  assert.ok(checkDrillAnswer(problem('number', '24', { unit: 's' }), '24s'));
  assert.ok(checkDrillAnswer(problem('number', '2048', { unit: 'MiB' }), '2048 MiB'));
  assert.ok(checkDrillAnswer(problem('number', '15', { unit: '%' }), '15 %'));
  assert.ok(!checkDrillAnswer(problem('number', '24'), '25'));
  assert.ok(checkDrillAnswer(problem('int', '-4'), 'x = -4'));
  assert.ok(checkDrillAnswer(problem('int', '-4'), '−4'));
  assert.ok(checkDrillAnswer(problem('bin', '1011'), '0000 1011'));
  assert.ok(checkDrillAnswer(problem('bin', '1011'), '0b1011'));
  assert.ok(!checkDrillAnswer(problem('bin', '1011'), '1012'));
  assert.ok(checkDrillAnswer(problem('hex', 'AF'), '0xaf'));
  assert.ok(checkDrillAnswer(problem('hex', '0AF'), 'af'));
  assert.ok(checkDrillAnswer(problem('ip', '192.168.1.64'), ' 192.168.1.64 '));
  assert.ok(!checkDrillAnswer(problem('ip', '192.168.1.64'), '192.168.1.65'));
  assert.ok(checkDrillAnswer(problem('fraction', '7/12'), '14/24'));
  assert.ok(checkDrillAnswer(problem('fraction', '3/4'), '0.75'));
  assert.ok(checkDrillAnswer(problem('fraction', '-1/6'), '-1/6'));
  assert.ok(checkDrillAnswer(problem('set', '-3, 2'), '2; -3'));
  assert.ok(checkDrillAnswer(problem('set', '-3, 2'), 'x1 = 2, x2 = -3'));
  assert.ok(checkDrillAnswer(problem('set', '-3, 2'), '2 und -3'));
  assert.ok(!checkDrillAnswer(problem('set', '-3, 2'), '2'));
  assert.ok(checkDrillAnswer(problem('set', '4'), '4'));
  assert.ok(!checkDrillAnswer(problem('int', '4'), ''));
});

test('subnet problems give the right network and broadcast', () => {
  const rng = seededRng(7);
  for (let i = 0; i < 200; i++) {
    for (const id of ['subnet-network', 'subnet-broadcast'] as const) {
      const p = makeProblem(id, 3, rng)!;
      const [ipText, prefixText] = (p.prompt[1] as { mono: string }).mono.split('/');
      const ip = ipText.split('.').reduce((acc, o) => acc * 256 + Number(o), 0);
      const prefix = Number(prefixText);
      const size = 2 ** (32 - prefix);
      const net = Math.floor(ip / size) * size;
      const want = id === 'subnet-network' ? net : net + size - 1;
      const text = [24, 16, 8, 0].map((s) => Math.floor(want / 2 ** s) % 256).join('.');
      assert.equal(p.answer, text, `${ipText}/${prefix}`);
    }
  }
});

test('the plotter finds the letters that become sliders', async () => {
  const { freeLetters } = await import('./expr.ts');
  assert.deepEqual(freeLetters('ax^2 + b*sin(x) + e + pi'), ['a', 'b']);
  assert.deepEqual(freeLetters('2x'), []);
});

test('every text a drill problem uses exists in English and German', async () => {
  const { readFileSync } = await import('node:fs');
  const en = JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url), 'utf8'));
  const de = JSON.parse(readFileSync(new URL('../i18n/de.json', import.meta.url), 'utf8'));
  const rng = seededRng(3);
  for (const def of DRILLS) {
    for (const key of [`drill.${def.id}.name`, `drill.${def.id}.desc`]) assert.ok(en[key] && de[key], key);
    for (let i = 0; i < 100; i++) {
      const p = makeProblem(def.id, ((i % 3) + 1) as Level, rng)!;
      for (const line of [...p.prompt, ...p.steps]) {
        if ('k' in line) assert.ok(en[line.k] && de[line.k], `${def.id}: ${line.k}`);
      }
    }
  }
});
