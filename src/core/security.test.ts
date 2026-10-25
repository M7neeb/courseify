import test from 'node:test';
import assert from 'node:assert/strict';
import { bitDiff, passwordStrength, sha256Hex, spanParts } from './security.ts';

test('SHA-256 gives the known digest, and a small change flips about half of the bits', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  const a = await sha256Hex('Courseify');
  const b = await sha256Hex('courseify');
  const diff = bitDiff(a, b);
  assert.ok(diff > 90 && diff < 166, `expected about 128 bits, got ${diff}`);
  assert.equal(bitDiff(a, a), 0);
  assert.equal(bitDiff('ff', 'f0'), 4);
});

test('common and short passwords are weak, long mixed ones are strong', () => {
  assert.equal(passwordStrength('password').label, 'veryWeak');
  assert.ok(passwordStrength('password').issues.includes('common'));
  assert.equal(passwordStrength('123456').label, 'veryWeak');
  assert.ok(passwordStrength('abcd1234').issues.includes('sequence'));
  assert.ok(passwordStrength('aaaaaaaaaaaaaaaa').issues.includes('repeat'));
  const strong = passwordStrength('tr0ub4dor&3-purple-Horse');
  assert.ok(['strong', 'veryStrong'].includes(strong.label), strong.label);
  assert.ok(strong.bits > passwordStrength('Tr0ub4d').bits);
  assert.equal(passwordStrength('').bits, 0);
});

test('length beats complexity: a long lower-case phrase outscores a short mixed password', () => {
  assert.ok(passwordStrength('correct horse battery staple').bits > passwordStrength('P@ss1!x').bits);
});

test('times are put in words', () => {
  assert.deepEqual(spanParts(0.2), { unit: 'instant', n: 0 });
  assert.deepEqual(spanParts(120), { unit: 'minutes', n: 2 });
  assert.equal(spanParts(86400 * 365 * 5).unit, 'years');
  assert.equal(spanParts(1e30).unit, 'huge');
});
