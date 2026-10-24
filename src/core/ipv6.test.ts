import test from 'node:test';
import assert from 'node:assert/strict';
import { expandIpv6, isFullIpv6, isShortestIpv6, parseIpv6, sameIpv6, shortenIpv6 } from './ipv6.ts';

test('parse reads :: in every position', () => {
  assert.deepEqual(parseIpv6('::'), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(parseIpv6('::1'), [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(parseIpv6('fe80::'), [0xfe80, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(parseIpv6('2001:db8::ff00:42:8329'), [0x2001, 0xdb8, 0, 0, 0, 0xff00, 0x42, 0x8329]);
  assert.deepEqual(parseIpv6('2001:DB8:0:0:0:0:0:1/64'), [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
});

test('parse rejects bad addresses', () => {
  for (const bad of ['', '1::2::3', ':::', '2001:db8', '1:2:3:4:5:6:7:8:9', 'g::1', '12345::1', '1:2:3:4:5:6:7::8'])
    assert.equal(parseIpv6(bad), null, bad);
});

test('shortening follows RFC 5952', () => {
  assert.equal(shortenIpv6([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]), '2001:db8::1');
  assert.equal(shortenIpv6([0x2001, 0, 0, 1, 0, 0, 0, 1]), '2001:0:0:1::1');
  assert.equal(shortenIpv6([0x2001, 0, 0, 1, 0, 0, 1, 1]), '2001::1:0:0:1:1');
  assert.equal(shortenIpv6([1, 0, 2, 0, 3, 0, 4, 0]), '1:0:2:0:3:0:4:0');
  assert.equal(shortenIpv6([0, 0, 0, 0, 0, 0, 0, 0]), '::');
});

test('expand then parse round-trips and the checks accept it', () => {
  const g = [0x2001, 0xdb8, 0, 0, 0, 0xff00, 0x42, 0x8329];
  const full = expandIpv6(g);
  assert.equal(full, '2001:0db8:0000:0000:0000:ff00:0042:8329');
  assert.deepEqual(parseIpv6(full), g);
  assert.ok(isFullIpv6(full.toUpperCase(), full));
  assert.ok(!isFullIpv6('2001:db8::ff00:42:8329', full));
  assert.ok(isShortestIpv6('2001:DB8::ff00:42:8329', '2001:db8::ff00:42:8329'));
  assert.ok(!isShortestIpv6('2001:db8:0:0:0:ff00:42:8329', '2001:db8::ff00:42:8329'));
  assert.ok(sameIpv6('2001:db8:0:0:0:ff00:42:8329', '2001:db8::ff00:42:8329/64'));
});
