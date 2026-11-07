import path from 'node:path';
import { mkdir, writeFile, readFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { projectRoot, inside } from '../files.mjs';
import { runProcess } from './process.mjs';

export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const MAX_SOURCE_BYTES = 30_000_000;
const MAX_FILES = 5000;

export async function git(root, args, input) {
  // Plumbing only: no checkout, filters, hooks, archive substitutions or index writes.
  const result = await runProcess('git', ['--no-pager', '--no-replace-objects', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, ...args], { cwd: root, input, maxBytes: MAX_SOURCE_BYTES * 2 + 2_000_000 });
  if (result.exitCode !== 0 || result.timedOut || result.outputLimit || result.error) throw new Error('Git could not read the selected repository: ' + (result.error || result.stderr.toString('utf8').trim() || 'timeout or output limit'));
  return result.stdout;
}
export async function repositoryRoot(root) {
  root = await projectRoot(root);
  const top = await projectRoot((await git(root, ['rev-parse', '--show-toplevel'])).toString('utf8').trim());
  if (path.relative(root, top)) throw new Error('Select the Git repository root: ' + top + '. Nested packages are not supported by this adapter yet.');
  return root;
}
function portablePath(file) {
  if (!file || file.length > 240 || /[\\:\x00-\x1f\x7f]/.test(file)) return false;
  return file.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^\.git$/i.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part));
}
export async function revision(root, ref) {
  if (typeof ref !== 'string' || !ref || ref.length > 200 || /[\x00-\x1f\x7f]/.test(ref)) throw new Error('Supply a local Git revision, for example HEAD or main.');
  const commit = (await git(root, ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}'])).toString().trim();
  const tree = (await git(root, ['rev-parse', '--verify', commit + '^{tree}'])).toString().trim();
  const records = (await git(root, ['ls-tree', '-r', '-l', '-z', '--full-tree', commit])).toString('utf8').split('\0').filter(Boolean);
  const files = records.map(record => {
    const match = /^(\d+) (blob|commit) ([a-f0-9]+)\s+(\d+|-)\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error('Unsupported Git tree record.');
    return { mode: match[1], type: match[2], oid: match[3], size: Number(match[4]), path: match[5] };
  });
  const seen = new Set();
  for (const file of files) {
    if (!['100644', '100755'].includes(file.mode) || file.type !== 'blob') throw new Error('Snapshot does not support symlinks or submodules: ' + file.path);
    if (!portablePath(file.path)) throw new Error('Snapshot path is not portable or safe: ' + JSON.stringify(file.path));
    const key = file.path.toLowerCase();
    if (seen.has(key)) throw new Error('Case-colliding snapshot paths are unsupported: ' + file.path);
    seen.add(key);
    if (file.path.split('/').some(part => ['node_modules', '.regra'].includes(part))) throw new Error('Remove tracked node_modules or .regra data before repository verification.');
  }
  if (files.length > MAX_FILES || files.reduce((total, file) => total + file.size, 0) > MAX_SOURCE_BYTES) throw new Error('Repository snapshot exceeds the beta limit of 5,000 files / 30 MB.');
  return { ref, commit, tree, files };
}
export async function blobs(root, files) {
  const unique = [...new Map(files.map(file => [file.oid, file])).values()];
  if (!unique.length) return new Map();
  const data = await git(root, ['cat-file', '--batch'], unique.map(file => file.oid).join('\n') + '\n');
  let offset = 0;
  const contents = new Map();
  for (const file of unique) {
    const end = data.indexOf(10, offset);
    const header = data.subarray(offset, end).toString();
    if (header !== file.oid + ' blob ' + file.size) throw new Error('Git blob metadata did not match the frozen manifest.');
    offset = end + 1;
    const content = data.subarray(offset, offset + file.size);
    if (content.length !== file.size || data[offset + file.size] !== 10) throw new Error('Incomplete Git blob response.');
    contents.set(file.oid, content);
    offset += file.size + 1;
  }
  if (offset !== data.length) throw new Error('Unexpected trailing Git blob data.');
  return contents;
}
function tokenize(script) {
  const tokens = script.match(/"[^"]*"|'[^']*'|[^\s]+/g) || [];
  if (tokens.join(' ').replace(/\s+/g, ' ') !== script.trim().replace(/\s+/g, ' ')) throw new Error('Unsupported test command quoting.');
  return tokens.map(token => token.replace(/^(['"])(.*)\1$/, '$2'));
}
function glob(pattern) {
  if (pattern.startsWith('/') || pattern.includes('..') || /[\\{}[\]!]/.test(pattern)) throw new Error('Unsupported test path pattern: ' + pattern);
  const source = pattern.replace(/^\.\//, '').split(/(\*\*\/|\*\*|\*|\?)/).map(part => part === '**/' ? '(?:.*/)?' : part === '**' ? '.*' : part === '*' ? '[^/]*' : part === '?' ? '[^/]' : part.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&')).join('');
  return new RegExp('^' + source + '$');
}
const jsFile = file => /\.(?:js|mjs|cjs)$/.test(file);
const defaultTest = file => jsFile(file) && (/(^|\/)test(?:\/|$)/.test(file) || /(^|\/)(?:test(?:[-_.].+)?|.+[._-]test)\.(?:js|mjs|cjs)$/.test(file));
export const contractPath = file => /(^|\/)(?:test|tests|__tests__|__snapshots__|fixtures)(\/|$)/.test(file) || /(?:[._-](?:test|spec)|^test)\.(?:mjs|cjs|js)$/.test(file);
export function detect(rev, content) {
  const packageFile = rev.files.find(file => file.path === 'package.json');
  let pkg = {};
  if (packageFile) {
    try { pkg = JSON.parse(content.get(packageFile.oid).toString('utf8').replace(/^\uFEFF/, '')); }
    catch { throw new Error('The committed package.json is not valid JSON.'); }
    if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('The committed package.json must be an object.');
  }
  const script = pkg.scripts?.test;
  const blockers = [];
  let patterns = null;
  if (script !== undefined) {
    if (typeof script !== 'string') blockers.push({ code: 'unsupported_command', detail: 'package.json scripts.test must be text.' });
    else {
      try {
        const args = tokenize(script);
        if (args[0] !== 'node' || args[1] !== '--test' || args.slice(2).some(arg => arg.startsWith('-') || /[;&|<>\x60$]/.test(arg))) throw new Error('Only a plain node --test command with optional file patterns is supported. Vitest, Jest, loaders, shell commands and additional flags need their own adapter.');
        patterns = args.slice(2).map(pattern => pattern.replace(/^\.\//, ''));
        patterns.forEach(glob);
      } catch (error) { blockers.push({ code: 'unsupported_command', detail: error.message }); }
    }
  }
  if (pkg.scripts?.pretest || pkg.scripts?.posttest) blockers.push({ code: 'lifecycle_steps', detail: 'pretest/posttest requires a reviewed setup adapter. REGRA does not silently skip project test lifecycle steps.' });
  if (pkg.workspaces) blockers.push({ code: 'workspaces', detail: 'Monorepo workspaces need a package-scoped adapter; select a standalone Node project for now.' });
  const all = rev.files.map(file => file.path);
  let tests = [];
  if (!blockers.length) {
    if (patterns?.length) tests = all.filter(file => jsFile(file) && patterns.some(pattern => glob(pattern).test(file) || file.startsWith(pattern.replace(/\/$/, '') + '/')));
    else tests = all.filter(defaultTest);
  }
  tests.sort();
  if (!tests.length && !blockers.length) blockers.push({ code: 'no_tests', detail: 'No committed Node test files were discovered. Add a node:test test and commit it first.' });
  if (tests.length > 200) blockers.push({ code: 'test_limit', detail: 'The first adapter supports at most 200 test files.' });
  const contracts = rev.files.filter(file => contractPath(file.path) || tests.includes(file.path));
  const dependencies = Object.assign({}, pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies);
  const lock = rev.files.find(file => file.path === 'package-lock.json');
  return { adapter: 'node-test', packageName: pkg.name ?? null, testScript: script ?? null, testFiles: tests, contractFiles: contracts, dependencies: Object.keys(dependencies), dependencyFingerprint: digest({ dependencies: pkg.dependencies, devDependencies: pkg.devDependencies, optionalDependencies: pkg.optionalDependencies, lock: lock?.oid }), hasLockfile: Boolean(lock), blockers };
}
export async function materialize(directory, files, content) {
  await mkdir(directory, { recursive: false });
  for (const file of files) {
    const destination = await inside(directory, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content.get(file.oid), { flag: 'wx', mode: file.mode === '100755' ? 0o755 : 0o644 });
  }
}
export async function changedContract(directory, files, content) {
  for (const file of files) {
    try {
      const target = await inside(directory, file.path);
      if (!(await lstat(target)).isFile() || digest(await readFile(target)) !== digest(content.get(file.oid))) return file.path;
    } catch { return file.path; }
  }
  return null;
}
