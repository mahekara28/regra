import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, access, realpath, symlink, unlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspectRepository, planRepository, verifyRepository, checkRepository, readRepositoryProof } from '../src/index.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const broken = 'export function average(xs) { return xs.reduce((a,b)=>a+b) / xs.length; }\n';
const fixed = 'export function average(xs) { return xs.length ? xs.reduce((a,b)=>a+b,0) / xs.length : 0; }\n';
const tests = "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {average} from '../average.mjs';\ntest('ordinary numbers',()=>assert.equal(average([2,4]),3));\ntest('empty input',()=>assert.equal(average([]),0));\n";
const manifest = { name: 'regra-repository-fixture', version: '1.0.0', private: true, type: 'module', scripts: { test: 'node --test "test/*.test.mjs"' } };
function git(root, ...args) { return execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-c', 'user.name=REGRA test', '-c', 'user.email=fixture@example.invalid', '-C', root, ...args], { encoding: 'utf8', windowsHide: true, timeout: 20000 }).trim(); }
async function commit(root, files, message) {
  for (const [name, source] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    if (source === null) await rm(target);
    else await writeFile(target, source);
  }
  git(root, 'add', '.');
  git(root, 'commit', '-qm', message);
  return git(root, 'rev-parse', 'HEAD');
}
async function fixture(t, { testSource = tests, before = broken, after = fixed, pkg = manifest, extra = {} } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'regra-repo-fixture-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('regra-repo-fixture-'));
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  });
  git(root, 'init', '-q');
  const baseline = await commit(root, { 'package.json': JSON.stringify(pkg), '.gitignore': '.regra/\n', 'average.mjs': before, 'test/average.test.mjs': testSource, ...extra }, 'reviewed baseline');
  const candidate = await commit(root, { 'average.mjs': after }, 'candidate repair');
  return { root, baseline, candidate, trusted: true };
}

test('real Git histories: discovery, repair proof, rejection, recurrence and checkout preservation', { timeout: 120000 }, async t => {
  const f = await fixture(t);
  const inspected = await inspectRepository({ root: f.root });
  assert.equal(inspected.supported, true);
  assert.deepEqual(inspected.testFiles, ['test/average.test.mjs']);
  const plan = await planRepository(f);
  assert.equal(plan.ready, true);
  assert.equal(plan.baseline.commit, f.baseline);
  assert.equal(plan.candidate.commit, f.candidate);
  await assert.rejects(access(path.join(f.root, '.regra')), { code: 'ENOENT' });
  await assert.rejects(verifyRepository({ ...f, trusted: false }), /--trusted/);
  // Deliberately dirty the worktree/index; execution still uses the frozen commits.
  await writeFile(path.join(f.root, 'average.mjs'), 'working change that is not executed');
  git(f.root, 'add', 'average.mjs');
  await writeFile(path.join(f.root, 'untracked.txt'), 'keep me');
  const status = git(f.root, 'status', '--porcelain=v1');
  const good = await verifyRepository({ ...f, expectedPlanHash: plan.planHash });
  assert.equal(good.status, 'verified', JSON.stringify(good));
  assert.equal(good.beforeRuns.length, 3);
  assert.equal(good.afterRuns.length, 3);
  assert.equal(good.plan.dirty, true);
  assert.ok(good.beforeRuns.every(run => run.results.some(result => !result.passed)));
  assert.ok(good.afterRuns.every(run => run.results.every(result => result.passed)));
  assert.equal(git(f.root, 'status', '--porcelain=v1'), status);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.candidate);
  assert.equal(await readFile(path.join(f.root, 'average.mjs'), 'utf8'), 'working change that is not executed');
  assert.equal((await readRepositoryProof({ root: f.root, id: good.id })).plan.contractHash, plan.contractHash);
  assert.equal((await checkRepository({ ...f, baseline: f.candidate })).status, 'verified');
  assert.equal((await verifyRepository({ ...f, baseline: f.candidate })).reason.code, 'not_reproduced');
  const stale = await verifyRepository({ ...f, expectedPlanHash: '0'.repeat(64) });
  assert.equal(stale.reason.code, 'stale_plan'); assert.equal(stale.beforeRuns.length, 0);
  // These commits are only in an owned scratch fixture, never the user's checkout.
  git(f.root, 'reset', '--hard', f.candidate);
  await rm(path.join(f.root, 'untracked.txt'));
  const bad = await commit(f.root, { 'average.mjs': 'export function average() { return 0; }\n' }, 'incomplete repair');
  const badProof = await verifyRepository({ ...f, candidate: bad });
  assert.equal(badProof.status, 'rejected');
  const mismatch = badProof.afterRuns[0].results.find(result => result.name === 'ordinary numbers').error.cause;
  assert.equal(mismatch.actual, '0'); assert.equal(mismatch.expected, '3');
  const recurrence = await commit(f.root, { 'average.mjs': broken }, 'reintroduced bug');
  const caught = await checkRepository({ ...f, baseline: f.candidate, candidate: recurrence });
  assert.equal(caught.status, 'rejected');
  assert.equal(caught.canProceed, false);
});

test('repository verification cleans snapshots when TEMP is a directory alias', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  const parent = await realpath(tmpdir());
  const area = await mkdtemp(path.join(parent, 'regra-temp-alias-'));
  const actual = path.join(area, 'actual');
  const alias = path.join(area, 'temp alias');
  t.after(async () => {
    await unlink(alias).catch(error => { if (error.code !== 'ENOENT') throw error; });
    assert.equal(path.dirname(area), parent);
    assert.equal(await realpath(area), area);
    assert.ok(path.basename(area).startsWith('regra-temp-alias-'));
    await rm(area, { recursive: true, force: true, maxRetries: 3 });
  });
  await mkdir(actual);
  await symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const run = spawnSync(process.execPath, [cli, 'repo-verify', '--root', f.root, '--baseline', f.baseline, '--candidate', f.candidate, '--trusted', '--json'], {
    env: { ...process.env, TEMP: alias, TMP: alias, TMPDIR: alias },
    encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 3000000
  });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  const proof = JSON.parse(run.stdout);
  assert.equal(proof.status, 'verified');
  assert.equal(proof.beforeRuns.length, 3);
  assert.equal(proof.afterRuns.length, 3);
  assert.deepEqual(proof.findings, []);
  assert.deepEqual(await readdir(actual), [], 'Disposable snapshots must be removed through the canonical path.');
  assert.equal((await readRepositoryProof({ root: f.root, id: proof.id })).status, 'verified');
  assert.equal(await readFile(path.join(f.root, 'average.mjs'), 'utf8'), fixed);
});

test('new regression cases are frozen and exercised on both old and new source', { timeout: 60000 }, async t => {
  const ordinary = tests.split("\ntest('empty input'")[0] + '\n';
  const f = await fixture(t, { testSource: ordinary });
  const candidate = await commit(f.root, { 'test/empty.test.mjs': "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {average} from '../average.mjs'; test('empty input',()=>assert.equal(average([]),0));\n" }, 'new reviewed reproducer');
  const plan = await planRepository({ ...f, candidate });
  assert.deepEqual(plan.addedTestFiles, ['test/empty.test.mjs']);
  const report = await verifyRepository({ ...f, candidate });
  assert.equal(report.status, 'verified', JSON.stringify(report));
  assert.equal(report.beforeRuns[0].results.length, 2);
});

test('changed, deleted and weakened contracts or test commands never grant approval', { timeout: 60000 }, async t => {
  const f = await fixture(t, { extra: { 'test/fixtures/values.json': '[2,4]' } });
  for (const [name, change, code] of [
    ['changed expectation', { 'test/average.test.mjs': tests.replace('average([2,4]),3', 'average([2,4]),0') }, 'contract_changed'],
    ['deleted test', { 'test/average.test.mjs': null }, 'contract_changed'],
    ['changed fixture', { 'test/fixtures/values.json': '[0,0]' }, 'contract_changed'],
    ['changed command', { 'package.json': JSON.stringify({ ...manifest, scripts: { test: 'node --test test/average.test.mjs' } }) }, 'test_command_changed'],
    ['changed dependencies', { 'package.json': JSON.stringify({ ...manifest, dependencies: { example: '1.0.0' } }) }, 'dependencies_changed']
  ]) {
    git(f.root, 'reset', '--hard', f.candidate);
    const candidate = await commit(f.root, change, name);
    const report = await verifyRepository({ ...f, candidate });
    assert.equal(report.status, 'inconclusive', name);
    assert.ok(report.findings.some(item => item.code === code), JSON.stringify(report.findings));
    assert.equal(report.beforeRuns.length, 0);
  }
});

test('empty tests, skipped tests, missing imports and unsupported runners fail closed', { timeout: 120000 }, async t => {
  const scenarios = [
    { name: 'empty file', testSource: 'export const notATest = true;\n', expected: 'no_executed_tests' },
    { name: 'skipped test', testSource: tests.replace("test('empty input'", "test.skip('empty input'"), expected: 'inactive_tests' },
    { name: 'todo test', testSource: tests.replace("test('empty input'", "test.todo('empty input'"), expected: 'inactive_tests' },
    { name: 'missing import', testSource: "import 'regra-missing-dependency';\n" + tests, expected: 'setup_failure' },
    { name: 'unsupported runner', pkg: { ...manifest, scripts: { test: 'vitest run' } }, expected: 'unsupported_command' },
    { name: 'pretest lifecycle', pkg: { ...manifest, scripts: { test: 'node --test', pretest: 'node generate-tests.js' } }, expected: 'lifecycle_steps' }
  ];
  for (const scenario of scenarios) await t.test(scenario.name, async st => {
    const f = await fixture(st, scenario);
    const report = await verifyRepository(f);
    assert.equal(report.status, 'inconclusive');
    assert.equal(report.reason.code, scenario.expected, JSON.stringify(report));
  });
});

test('timeouts stop execution and retain an inconclusive proof', { timeout: 30000 }, async t => {
  const f = await fixture(t, { before: 'export function average() { while(true) {} }\n' });
  const started = Date.now();
  const report = await verifyRepository({ ...f, timeoutMs: 600 });
  assert.equal(report.status, 'inconclusive');
  assert.equal(report.reason.code, 'timeout');
  assert.ok(Date.now() - started < 15000);
  assert.equal(report.beforeRuns[0].timedOut, true);
});

test('repeatability and test mutation are checked independently of a green exit', { timeout: 90000 }, async t => {
  await t.test('flaky results', async st => {
    const shared = await mkdtemp(path.join(tmpdir(), 'regra-flake-'));
    st.after(() => rm(shared, { recursive: true, force: true }));
    const file = JSON.stringify(path.join(shared, 'counter'));
    const source = "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync,writeFileSync} from 'node:fs';\ntest('stable',()=>assert.ok(true));\ntest('changes between runs',()=>{let n;try{n=Number(readFileSync(" + file + ",'utf8'))}catch{n=0} writeFileSync(" + file + ",String(n+1)); assert.equal(Math.floor(n/2)%2,0);});\n";
    const f = await fixture(st, { testSource: source });
    const report = await verifyRepository(f);
    assert.equal(report.reason.code, 'unstable_results', JSON.stringify(report));
  });
  await t.test('test file rewrites itself', async st => {
    const source = tests + "import {appendFileSync} from 'node:fs'; test('mutates contract',()=>appendFileSync(new URL('./average.test.mjs', import.meta.url),'\\n// changed'));\n";
    const f = await fixture(st, { testSource: source });
    const report = await verifyRepository(f);
    assert.equal(report.reason.code, 'contract_mutated', JSON.stringify(report));
  });
});

test('optional locked dependency setup uses disposable snapshots and disables lifecycle scripts', { timeout: 120000 }, async t => {
  const pkg = { ...manifest, scripts: { ...manifest.scripts, preinstall: "node -e \"require('fs').writeFileSync('install-ran','bad')\"" } };
  const lock = { name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true, packages: { '': { name: pkg.name, version: pkg.version } } };
  const hookGuard = tests + "import {existsSync} from 'node:fs'; test('install hook was not executed',()=>assert.equal(existsSync(new URL('../install-ran',import.meta.url)),false));\n";
  const f = await fixture(t, { pkg, testSource: hookGuard, extra: { 'package-lock.json': JSON.stringify(lock) } });
  const report = await verifyRepository({ ...f, installDependencies: true });
  assert.equal(report.status, 'verified', JSON.stringify(report));
  assert.equal(report.installations.length, 6);
  assert.equal(report.installations.every(run => run.exitCode === 0), true);
  assert.match(report.environment.git, /^git version /);
  assert.match(report.environment.npm, /^\d+\./);
  assert.ok((await readdir(f.root)).every(file => file !== 'node_modules' && file !== 'install-ran'));
});

test('CLI preview, trust boundary, JSON result and evidence share the library decision', { timeout: 90000 }, async t => {
  const f = await fixture(t);
  const call = args => spawnSync(process.execPath, [cli, ...args, '--root', f.root, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 3000000 });
  const common = ['--baseline', f.baseline, '--candidate', f.candidate];
  const preview = call(['repo-verify', ...common, '--dry-run']);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).ready, true);
  const denied = call(['repo-verify', ...common]);
  assert.equal(denied.status, 2);
  assert.match(JSON.parse(denied.stdout).error, /--trusted/);
  const result = call(['repo-verify', ...common, '--trusted']);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.status, 'verified');
  assert.equal(JSON.parse(call(['repo-evidence', '--id', proof.id]).stdout).plan.candidate.commit, f.candidate);
  assert.equal(call(['repo-verify', ...common, '--trusted', '--timeout', 'NaN']).status, 2);
});

test('MCP exposes real repository plans and saved proof summaries without execution', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  const { initProject } = await import('../src/project.mjs');
  const { Client } = await import('@modelcontextprotocol/client');
  const { StdioClientTransport } = await import('@modelcontextprotocol/client/stdio');
  await initProject({ root: f.root, project: 'repository-agent-test' });
  const proof = await verifyRepository(f);
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp', '--root', f.root], stderr: 'pipe' });
  transport.stderr.resume();
  const client = new Client({ name: 'repository-check', version: '1.0.0' });
  try {
    await client.connect(transport);
    const call = arguments_ => client.callTool({ name: 'regra_repository', arguments: arguments_ });
    const inspected = await call({ action: 'inspect' });
    assert.equal(inspected.structuredContent.supported, true);
    const planned = await call({ action: 'plan', baseline: f.baseline, candidate: f.candidate });
    assert.equal(planned.structuredContent.planHash, proof.plan.planHash);
    const evidence = await call({ action: 'evidence', id: proof.id });
    assert.equal(evidence.structuredContent.canProceed, true);
    assert.equal(evidence.structuredContent.baseline.commit, f.baseline);
    assert.equal((await call({ action: 'plan', baseline: f.baseline, trusted: true })).isError, true);
    assert.equal((await readdir(path.join(f.root, '.regra/repository/proofs'))).length, 1);
  } finally { await client.close(); await transport.close(); }
});

test('read-only discovery does not run scripts, honors quoted paths and rejects linked snapshots', { timeout: 30000 }, async t => {
  const f = await fixture(t, { pkg: { ...manifest, scripts: { test: 'node --test "test dir/*.test.mjs"' } }, extra: { 'test dir/space.test.mjs': tests.replace("'../average.mjs'", "'../average.mjs'") } });
  assert.deepEqual((await inspectRepository({ root: f.root })).testFiles, ['test dir/space.test.mjs']);
  assert.equal((await verifyRepository(f)).status, 'verified');
  const oid = git(f.root, 'hash-object', '-w', '--stdin');
  // Put a Git symlink object in the fixture index without creating a host symlink.
  git(f.root, 'update-index', '--add', '--cacheinfo', '120000,' + oid + ',linked-test');
  git(f.root, 'commit', '-qm', 'unsupported symbolic link');
  await assert.rejects(inspectRepository({ root: f.root }), /symlinks or submodules/);
});
