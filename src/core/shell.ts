// A light fake shell for the Linux course: a small in-memory file tree and the everyday commands
// (pwd, ls, cd, cat, mkdir, touch, rm, cp, mv, echo, head, wc, grep). It never touches the real
// computer. A question can end when a command was typed, or when the tree reaches a state.

export type FsNode = string | { [name: string]: FsNode };
export type Fs = { [name: string]: FsNode };

export type ShellGoal =
  | { cmd: string }
  | { exists: string }
  | { missing: string }
  | { cwd: string }
  | { file: string; equals?: string; contains?: string };

export interface ShellState {
  fs: Fs;
  cwd: string;
  home: string;
  history: string[];
}

export interface ShellResult {
  out: string[];
}

const isDir = (n: FsNode | undefined): n is Fs => typeof n === 'object' && n !== null;

export function createShell(fs: Fs, cwd = '/home/anna', home = '/home/anna'): ShellState {
  return { fs: JSON.parse(JSON.stringify(fs)) as Fs, cwd, home, history: [] };
}

/** Absolute path pieces for a path typed by the learner, resolving ., .. and ~. */
export function resolvePath(state: ShellState, path: string): string[] {
  let p = path;
  if (p === '~' || p.startsWith('~/')) p = state.home + p.slice(1);
  const base = p.startsWith('/') ? [] : state.cwd.split('/').filter(Boolean);
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') base.pop();
    else base.push(part);
  }
  return base;
}

const text = (parts: string[]): string => '/' + parts.join('/');

function lookup(state: ShellState, parts: string[]): FsNode | undefined {
  let node: FsNode = state.fs;
  for (const part of parts) {
    if (!isDir(node) || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

function parentOf(state: ShellState, parts: string[]): { dir: Fs; name: string } | undefined {
  if (parts.length === 0) return undefined;
  const dir = lookup(state, parts.slice(0, -1));
  return isDir(dir) ? { dir, name: parts[parts.length - 1] } : undefined;
}

/** Splits a command line into words; quotes group words. */
export function words(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function perms(node: FsNode): string {
  return isDir(node) ? 'drwxr-xr-x' : '-rw-r--r--';
}

function size(node: FsNode): number {
  return isDir(node) ? 4096 : node.length;
}

function listNames(dir: Fs, all: boolean): string[] {
  const names = Object.keys(dir).sort((a, b) => a.localeCompare(b));
  const visible = all ? names : names.filter((n) => !n.startsWith('.'));
  return all ? ['.', '..', ...visible] : visible;
}

function fileLines(content: string): string[] {
  return content === '' ? [] : content.replace(/\n$/, '').split('\n');
}

/** Runs one command line and returns what it prints. The state is changed in place. */
export function runShell(state: ShellState, line: string): ShellResult {
  const trimmed = line.trim();
  if (trimmed) state.history.push(trimmed.replace(/\s+/g, ' '));
  if (!trimmed) return { out: [] };

  // echo text > file, echo text >> file
  const redirect = /^(.*?)\s*(>>|>)\s*(\S+)\s*$/.exec(trimmed);
  let command = trimmed;
  let target: { path: string; append: boolean } | null = null;
  if (redirect) {
    command = redirect[1];
    target = { path: redirect[3], append: redirect[2] === '>>' };
  }
  const result = exec(state, words(command));
  if (!target) return result;
  const parts = resolvePath(state, target.path);
  const where = parentOf(state, parts);
  if (!where) return { out: [`bash: ${target.path}: No such file or directory`] };
  const existing = where.dir[where.name];
  if (isDir(existing)) return { out: [`bash: ${target.path}: Is a directory`] };
  const added = result.out.join('\n') + (result.out.length ? '\n' : '');
  where.dir[where.name] = target.append && typeof existing === 'string' ? existing + added : added;
  return { out: [] };
}

function exec(state: ShellState, w: string[]): ShellResult {
  const [cmd, ...rest] = w;
  const flags = rest.filter((a) => a.startsWith('-') && a.length > 1);
  const args = rest.filter((a) => !(a.startsWith('-') && a.length > 1));
  const has = (f: string) => flags.some((x) => x.slice(1).includes(f));
  const err = (m: string): ShellResult => ({ out: [m] });

  switch (cmd) {
    case undefined:
      return { out: [] };
    case 'pwd':
      return { out: [text(state.cwd.split('/').filter(Boolean))] };
    case 'echo':
      return { out: [args.join(' ')] };
    case 'whoami':
      return { out: ['anna'] };
    case 'clear':
      return { out: [] };
    case 'cd': {
      const parts = resolvePath(state, args[0] ?? '~');
      const node = lookup(state, parts);
      if (node === undefined) return err(`bash: cd: ${args[0]}: No such file or directory`);
      if (!isDir(node)) return err(`bash: cd: ${args[0]}: Not a directory`);
      state.cwd = text(parts);
      return { out: [] };
    }
    case 'ls': {
      const targets = args.length ? args : ['.'];
      const out: string[] = [];
      for (const t of targets) {
        const parts = resolvePath(state, t);
        const node = lookup(state, parts);
        if (node === undefined) {
          out.push(`ls: cannot access '${t}': No such file or directory`);
          continue;
        }
        if (targets.length > 1) out.push(`${t}:`);
        if (!isDir(node)) {
          out.push(has('l') ? `${perms(node)} 1 anna anna ${String(size(node)).padStart(5)} ${t}` : t);
          continue;
        }
        const names = listNames(node, has('a'));
        if (has('l')) {
          for (const n of names) {
            const child = n === '.' || n === '..' ? node : node[n];
            out.push(`${perms(child)} 1 anna anna ${String(size(child)).padStart(5)} ${n}`);
          }
        } else if (names.length) out.push(names.join('  '));
      }
      return { out };
    }
    case 'cat': {
      if (args.length === 0) return err('cat: missing file');
      const out: string[] = [];
      for (const a of args) {
        const node = lookup(state, resolvePath(state, a));
        if (node === undefined) out.push(`cat: ${a}: No such file or directory`);
        else if (isDir(node)) out.push(`cat: ${a}: Is a directory`);
        else out.push(...fileLines(node));
      }
      return { out };
    }
    case 'head': {
      const n = Number(rest[rest.indexOf('-n') + 1]) || 10;
      const file = args.find((a) => a !== String(n));
      const node = file ? lookup(state, resolvePath(state, file)) : undefined;
      if (typeof node !== 'string') return err(`head: cannot open '${file ?? ''}' for reading: No such file or directory`);
      return { out: fileLines(node).slice(0, n) };
    }
    case 'wc': {
      const node = args[0] ? lookup(state, resolvePath(state, args[0])) : undefined;
      if (typeof node !== 'string') return err(`wc: ${args[0] ?? ''}: No such file or directory`);
      const lines = fileLines(node).length;
      return { out: [has('l') ? `${lines} ${args[0]}` : `${lines} ${node.split(/\s+/).filter(Boolean).length} ${node.length} ${args[0]}`] };
    }
    case 'grep': {
      const [word, file] = args;
      const node = file ? lookup(state, resolvePath(state, file)) : undefined;
      if (typeof node !== 'string') return err(`grep: ${file ?? ''}: No such file or directory`);
      return { out: fileLines(node).filter((l) => (has('i') ? l.toLowerCase().includes(word.toLowerCase()) : l.includes(word))) };
    }
    case 'mkdir': {
      const out: string[] = [];
      for (const a of args) {
        const parts = resolvePath(state, a);
        if (has('p')) {
          let dir: Fs = state.fs;
          for (const part of parts) {
            if (!isDir(dir[part])) dir[part] = {};
            dir = dir[part] as Fs;
          }
          continue;
        }
        const where = parentOf(state, parts);
        if (!where) out.push(`mkdir: cannot create directory '${a}': No such file or directory`);
        else if (where.name in where.dir) out.push(`mkdir: cannot create directory '${a}': File exists`);
        else where.dir[where.name] = {};
      }
      return { out };
    }
    case 'touch': {
      const out: string[] = [];
      for (const a of args) {
        const where = parentOf(state, resolvePath(state, a));
        if (!where) out.push(`touch: cannot touch '${a}': No such file or directory`);
        else if (!(where.name in where.dir)) where.dir[where.name] = '';
      }
      return { out };
    }
    case 'rm': {
      const out: string[] = [];
      for (const a of args) {
        const where = parentOf(state, resolvePath(state, a));
        const node = where ? where.dir[where.name] : undefined;
        if (!where || node === undefined) out.push(`rm: cannot remove '${a}': No such file or directory`);
        else if (isDir(node) && !has('r') && !has('R')) out.push(`rm: cannot remove '${a}': Is a directory`);
        else delete where.dir[where.name];
      }
      return { out };
    }
    case 'cp':
    case 'mv': {
      if (args.length !== 2) return err(`${cmd}: missing file operand`);
      const [from, to] = args;
      const fromParts = resolvePath(state, from);
      const src = lookup(state, fromParts);
      if (src === undefined) return err(`${cmd}: cannot stat '${from}': No such file or directory`);
      if (isDir(src) && cmd === 'cp' && !has('r') && !has('R')) return err(`cp: -r not specified; omitting directory '${from}'`);
      let toParts = resolvePath(state, to);
      const dest = lookup(state, toParts);
      if (isDir(dest)) toParts = [...toParts, fromParts[fromParts.length - 1]];
      const where = parentOf(state, toParts);
      if (!where) return err(`${cmd}: cannot move to '${to}': No such file or directory`);
      where.dir[where.name] = JSON.parse(JSON.stringify(src)) as FsNode;
      if (cmd === 'mv') {
        const old = parentOf(state, fromParts);
        if (old && text(fromParts) !== text(toParts)) delete old.dir[old.name];
      }
      return { out: [] };
    }
    default:
      return err(`${cmd}: command not found`);
  }
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Whether a goal is reached by what the learner has typed and the tree now. */
export function goalMet(goal: ShellGoal, state: ShellState): boolean {
  if ('cmd' in goal) {
    const re = new RegExp(`^(?:${goal.cmd})$`);
    return state.history.some((h) => re.test(h));
  }
  if ('exists' in goal) return lookup(state, resolvePath({ ...state, cwd: '/' }, goal.exists)) !== undefined;
  if ('missing' in goal) return lookup(state, resolvePath({ ...state, cwd: '/' }, goal.missing)) === undefined;
  if ('cwd' in goal) return state.cwd === text(resolvePath({ ...state, cwd: '/' }, goal.cwd));
  const node = lookup(state, resolvePath({ ...state, cwd: '/' }, goal.file));
  if (typeof node !== 'string') return false;
  if (goal.equals !== undefined) return norm(node) === norm(goal.equals);
  return goal.contains !== undefined ? node.includes(goal.contains) : true;
}
