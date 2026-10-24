import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_TASKS, SUBNET_MODES, bitsSplit, checkSubnetField, makeSubnetTask, seededRng, subnetInfo, type SubnetField } from './subnet.ts';

const LEVELS = [1, 2, 3] as const;

test('subnetInfo for a known host', () => {
  const i = subnetInfo([192, 168, 10, 77], 26);
  assert.deepEqual(i.mask, [255, 255, 255, 192]);
  assert.deepEqual(i.net, [192, 168, 10, 64]);
  assert.deepEqual(i.first, [192, 168, 10, 65]);
  assert.deepEqual(i.last, [192, 168, 10, 126]);
  assert.deepEqual(i.bc, [192, 168, 10, 127]);
  assert.equal(i.hosts, 62);
  const j = subnetInfo([172, 16, 45, 200], 20);
  assert.deepEqual(j.net, [172, 16, 32, 0]);
  assert.deepEqual(j.bc, [172, 16, 47, 255]);
  assert.equal(j.hosts, 4094);
});

test('bitsSplit puts the bar between network and host bits', () => {
  assert.equal(bitsSplit([192, 168, 1, 77], 26), '11000000.10101000.00000001.01|001101');
  assert.equal(bitsSplit([255, 255, 255, 0], 24), '11111111.11111111.11111111|00000000');
});

test('every generated answer passes its own check, in every kind and level', () => {
  for (const mode of SUBNET_MODES) {
    for (const level of LEVELS) {
      for (let seed = 1; seed <= 300; seed++) {
        const t = makeSubnetTask(mode, level, seededRng(seed * 7 + level));
        assert.ok(t.fields.length >= 3 && t.steps.length > 0);
        for (const f of t.fields) assert.ok(checkSubnetField(f, f.answer), `${mode} ${level} ${seed} ${f.id}`);
      }
    }
  }
});

test('full tasks agree with a bit-by-bit calculation', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const t = makeSubnetTask('full', 3, seededRng(seed));
    const given = (t.prompt[1] as { mono: string }).mono;
    const [ipPart, rest] = given.includes('/') ? given.split('/') : given.split(/\s+/);
    const ip = ipPart.split('.').map(Number);
    const prefix = given.includes('/') ? Number(rest) : rest.split('.').map((o) => Number(o).toString(2)).join('').replace(/0/g, '').length;
    const bits = ip.map((o) => o.toString(2).padStart(8, '0')).join('');
    const netBits = bits.slice(0, prefix).padEnd(32, '0');
    const bcBits = bits.slice(0, prefix).padEnd(32, '1');
    const toIp = (b: string) => b.match(/.{8}/g)!.map((x) => parseInt(x, 2)).join('.');
    const field = (id: string) => t.fields.find((f) => f.id === id)!.answer;
    assert.equal(field('network'), toIp(netBits));
    assert.equal(field('broadcast'), toIp(bcBits));
    assert.equal(Number(field('hosts')), 2 ** (32 - prefix) - 2);
    const first = (parseInt(netBits, 2) + 1) >>> 0;
    assert.equal(field('first').split('.').reduce((a, o) => a * 256 + Number(o), 0), first);
  }
});

test('vlsm gives the smallest subnet that holds the hosts', () => {
  for (const level of LEVELS) {
    for (let seed = 1; seed <= 300; seed++) {
      const t = makeSubnetTask('vlsm', level, seededRng(seed));
      const n = (t.prompt[0] as unknown as { v: { n: number } }).v.n;
      const prefix = Number(t.fields[0].answer);
      const hosts = Number(t.fields[2].answer);
      assert.ok(hosts >= n, 'holds the hosts');
      assert.ok(2 ** (32 - prefix - 1) - 2 < n, 'one bit fewer would not');
    }
  }
});

test('same-network tasks say yes exactly when the networks match', () => {
  let yes = 0;
  let no = 0;
  for (const level of LEVELS) {
    for (let seed = 1; seed <= 300; seed++) {
      const t = makeSubnetTask('same', level, seededRng(seed));
      const [a, b, same] = t.fields;
      assert.equal(same.answer === 'yes', a.answer === b.answer);
      if (same.answer === 'yes') yes++;
      else no++;
    }
  }
  assert.ok(yes > 100 && no > 100);
});

test('the octets given for free really are the answer octets', () => {
  for (const mode of SUBNET_MODES) {
    for (let seed = 1; seed <= 200; seed++) {
      const t = makeSubnetTask(mode, 3, seededRng(seed));
      const nets = t.fields.filter((f) => f.kind === 'ip' && (f.id === 'netA' || f.id === 'netB'));
      for (const f of t.fields.filter((x) => x.kind === 'ip')) {
        assert.ok(f.fixed >= 0 && f.fixed <= 3);
        if (nets.length === 2) assert.equal(nets[0].answer.split('.').slice(0, f.fixed).join('.'), nets[1].answer.split('.').slice(0, f.fixed).join('.'));
      }
    }
  }
});

test('exam tasks all have a clean prefix', () => {
  for (const t of EXAM_TASKS) assert.ok(t.prefix >= 9 && t.prefix <= 30);
});

test('checking accepts sensible spellings and rejects wrong answers', () => {
  const ip: SubnetField = { id: 'network', label: '', kind: 'ip', answer: '192.168.1.64', fixed: 3 };
  assert.ok(checkSubnetField(ip, ' 192.168.001.64 '));
  assert.ok(!checkSubnetField(ip, '192.168.1.65'));
  assert.ok(!checkSubnetField(ip, '192.168.1'));
  const n: SubnetField = { id: 'hosts', label: '', kind: 'int', answer: '1022', fixed: 0 };
  assert.ok(checkSubnetField(n, '1022'));
  assert.ok(checkSubnetField(n, '1.022'));
  assert.ok(!checkSubnetField(n, '1024'));
  const p: SubnetField = { id: 'prefix', label: '', kind: 'int', answer: '26', fixed: 0 };
  assert.ok(checkSubnetField(p, '/26') && checkSubnetField(p, '26'));
  const y: SubnetField = { id: 'same', label: '', kind: 'yesno', answer: 'yes', fixed: 0 };
  assert.ok(checkSubnetField(y, 'yes') && !checkSubnetField(y, 'no') && !checkSubnetField(y, ''));
});
