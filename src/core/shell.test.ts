import test from 'node:test';
import assert from 'node:assert/strict';
import { createShell, goalMet, resolvePath, runShell, words } from './shell.ts';

const tree = {
  home: {
    anna: {
      'notes.txt': 'milk\nbread\neggs\n',
      '.hidden': 'x',
      Documents: { 'a.txt': 'alpha', sub: {} },
      Downloads: {}
    }
  },
  etc: { hosts: '127.0.0.1 localhost\n' }
};
const sh = () => createShell(tree);
const run = (s: ReturnType<typeof sh>, line: string) => runShell(s, line).out;

test('words keeps quoted text together', () => {
  assert.deepEqual(words('echo "hello world" x'), ['echo', 'hello world', 'x']);
});

test('pwd, cd and relative, absolute and home paths', () => {
  const s = sh();
  assert.deepEqual(run(s, 'pwd'), ['/home/anna']);
  run(s, 'cd Documents');
  assert.deepEqual(run(s, 'pwd'), ['/home/anna/Documents']);
  run(s, 'cd ..');
  run(s, 'cd /etc');
  assert.deepEqual(run(s, 'pwd'), ['/etc']);
  run(s, 'cd ~');
  assert.deepEqual(run(s, 'pwd'), ['/home/anna']);
  assert.deepEqual(run(s, 'cd nowhere'), ['bash: cd: nowhere: No such file or directory']);
  assert.deepEqual(run(s, 'cd notes.txt'), ['bash: cd: notes.txt: Not a directory']);
  assert.deepEqual(resolvePath(s, '../../etc/./hosts'), ['etc', 'hosts']);
});

test('ls lists names, hides dotfiles unless -a, and has a long form', () => {
  const s = sh();
  assert.deepEqual(run(s, 'ls'), ['Documents  Downloads  notes.txt']);
  assert.ok(run(s, 'ls -a')[0].includes('.hidden'));
  assert.ok(run(s, 'ls -l').some((l) => l.startsWith('drwxr-xr-x') && l.endsWith('Documents')));
  assert.deepEqual(run(s, 'ls /nope'), ["ls: cannot access '/nope': No such file or directory"]);
});

test('cat, head, wc and grep read files', () => {
  const s = sh();
  assert.deepEqual(run(s, 'cat notes.txt'), ['milk', 'bread', 'eggs']);
  assert.deepEqual(run(s, 'head -n 2 notes.txt'), ['milk', 'bread']);
  assert.deepEqual(run(s, 'wc -l notes.txt'), ['3 notes.txt']);
  assert.deepEqual(run(s, 'grep bread notes.txt'), ['bread']);
  assert.deepEqual(run(s, 'cat missing'), ['cat: missing: No such file or directory']);
});

test('mkdir, touch, cp, mv and rm change the tree', () => {
  const s = sh();
  run(s, 'mkdir Projects');
  run(s, 'touch Projects/todo.txt');
  assert.ok(goalMet({ exists: '/home/anna/Projects/todo.txt' }, s));
  run(s, 'cp notes.txt Projects');
  assert.ok(goalMet({ exists: '/home/anna/Projects/notes.txt' }, s));
  run(s, 'mv notes.txt Documents/list.txt');
  assert.ok(goalMet({ missing: '/home/anna/notes.txt' }, s) && goalMet({ exists: '/home/anna/Documents/list.txt' }, s));
  assert.deepEqual(run(s, 'rm Documents'), ["rm: cannot remove 'Documents': Is a directory"]);
  run(s, 'rm -r Documents');
  assert.ok(goalMet({ missing: '/home/anna/Documents' }, s));
  assert.deepEqual(run(s, 'mkdir Projects'), ["mkdir: cannot create directory 'Projects': File exists"]);
  run(s, 'mkdir -p a/b/c');
  assert.ok(goalMet({ exists: '/home/anna/a/b/c' }, s));
});

test('echo with > and >> writes files', () => {
  const s = sh();
  run(s, 'echo hello > greeting.txt');
  run(s, 'echo world >> greeting.txt');
  assert.deepEqual(run(s, 'cat greeting.txt'), ['hello', 'world']);
  assert.ok(goalMet({ file: '/home/anna/greeting.txt', equals: 'hello world' }, s));
  assert.ok(goalMet({ file: '/home/anna/greeting.txt', contains: 'world' }, s));
});

test('goals: a typed command, the current folder, and unknown commands', () => {
  const s = sh();
  assert.equal(goalMet({ cmd: 'ls( -l)?' }, s), false);
  run(s, 'ls  -l');
  assert.equal(goalMet({ cmd: 'ls( -l)?' }, s), true);
  run(s, 'cd Documents/sub');
  assert.equal(goalMet({ cwd: '/home/anna/Documents/sub' }, s), true);
  assert.deepEqual(run(s, 'sudo rm -rf /'), ['sudo: command not found']);
  assert.ok(goalMet({ exists: '/etc/hosts' }, s), 'nothing outside was touched');
});

test('the start state is a copy: one run does not change the next', () => {
  const a = sh();
  run(a, 'rm notes.txt');
  const b = sh();
  assert.deepEqual(run(b, 'cat notes.txt'), ['milk', 'bread', 'eggs']);
});
