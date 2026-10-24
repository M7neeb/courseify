import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAPTURE_FRAMES, CAPTURE_QUESTIONS, NET_TERMINAL_TASKS, WALK_SCENARIOS, walkChoice } from './labData.ts';
import { seededRng } from './drills.ts';

const en = JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url), 'utf8'));
const de = JSON.parse(readFileSync(new URL('../i18n/de.json', import.meta.url), 'utf8'));
const has = (key: string) => assert.ok(en[key] && de[key], key);

test('every walk step has a label and a reason in both languages, and choices hold the right answer once', () => {
  for (const sc of WALK_SCENARIOS) {
    has(`walk.title.${sc.id}`);
    has(`walk.intro.${sc.id}`);
    has(`walk.qFirst.${sc.id}`);
    sc.steps.forEach((step, i) => {
      has(`walk.${sc.id}.${step.id}.label`);
      has(`walk.${sc.id}.${step.id}.why`);
      for (let seed = 1; seed <= 20; seed++) {
        const c = walkChoice(sc, i, seededRng(seed));
        assert.equal(c.keys.length, Math.min(4, sc.steps.length));
        assert.equal(new Set(c.keys).size, c.keys.length);
        assert.equal(c.keys[c.correct], `walk.${sc.id}.${step.id}.label`);
      }
    });
  }
});

test('every terminal task is solved by its own command and its text exists', () => {
  const solutions: Record<string, string> = { ip: 'ipconfig', ping: 'ping 192.168.1.1', arp: 'arp -a', dns: 'nslookup example.com', route: 'tracert example.com' };
  for (const t of NET_TERMINAL_TASKS) {
    for (const key of [`term.task.${t.id}`, `term.hint.${t.id}`, `term.done.${t.id}`]) has(key);
    assert.ok(t.exec(solutions[t.id]).done, t.id);
    assert.ok(!t.exec('dir').done);
    assert.ok(!t.exec('').done);
    assert.ok(t.exec('dir').out[0].includes('not available'));
  }
});

test('capture questions point at real frames and have texts', () => {
  const nos = CAPTURE_FRAMES.map((f) => f.no);
  assert.deepEqual(nos, nos.map((_, i) => i + 1));
  for (const q of CAPTURE_QUESTIONS) {
    has(`cap.q.${q.id}`);
    has(`cap.why.${q.id}`);
    if (q.kind === 'row') assert.ok(nos.includes(q.answer));
    else assert.ok(q.answer >= 0 && q.answer < q.options.length);
  }
  const f = (n: number) => CAPTURE_FRAMES[n - 1];
  assert.equal(f(5).info.includes('[SYN]'), true);
  assert.equal(f(4).proto, 'DNS');
  assert.equal(f(12).info.includes('FIN'), true);
});
