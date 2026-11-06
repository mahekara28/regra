import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verify, execute, validateSpec } from '../src/core.mjs';
import { Store } from '../src/store.mjs';
import { examples } from '../src/examples.mjs';

const example = examples[0];
test('reproduces the bug and verifies the correct fix with observed outputs', async () => {
  const run = await verify({ spec: example.spec, before: example.before, after: example.after });
  assert.equal(run.status, 'verified');
  assert.equal(run.beforeResults[0].observations[0].kind, 'throw');
  assert.equal(run.afterResults[0].observations[0].value, 0);
  assert.ok(run.gates.every(g => g.passed));
});
test('a fix that hides the crash but breaks valid inputs is rejected', async () => {
  const run = await verify({ spec: example.spec, before: example.before, after: example.bad });
  assert.equal(run.status, 'rejected');
  assert.equal(run.afterResults[0].passed, true);
  assert.equal(run.afterResults[1].passed, false);
});
test('cannot invent evidence for a bug that the old code already passes', async () => {
  const run = await verify({ spec: example.spec, before: example.after, after: example.after });
  assert.equal(run.status, 'inconclusive');
  assert.equal(run.gates[0].passed, false);
});
test('syntax errors, missing entry points and timeouts never count as reproduction', async () => {
  for (const before of ['function average(', 'function other() {}', 'function average(values) { while(true) {} }']) {
    const run = await verify({ spec: example.spec, before, after: example.after });
    assert.equal(run.status, 'inconclusive');
    assert.equal(run.gates[0].passed, false);
  }
});
test('expected exceptions are checked by error name', async () => {
  const cases = [{ id: 'one', name: 'Reject empty', args: [[]], throws: 'TypeError' }];
  const results = await execute('function f(x) { if(!x.length) throw new TypeError("empty"); return 1; }', 'f', cases);
  assert.ok(results[0].passed);
  const wrong = await execute('function f(x) { throw new Error("empty"); }', 'f', cases);
  assert.equal(wrong[0].passed, false);
});
test('candidate code does not receive the expected outputs or mutate later inputs', async () => {
  const cases = [{ id: 'one', name: 'Independent input', args: [[1]], expect: 2 }];
  const results = await execute('function f(x) { x.push(2); return x.length; }', 'f', cases);
  assert.equal(results[0].passes, 3);
  assert.deepEqual(cases[0].args, [[1]]);
});
test('non-JSON and asynchronous outputs are inconclusive instead of false passes', async () => {
  for (const source of ['function f() { return NaN; }', 'async function f() { return null; }', 'function f() { return undefined; }']) {
    const result = await execute(source, 'f', [{ id: 'one', name: 'Null', args: [], expect: null }]);
    assert.equal(result[0].valid, false);
  }
});
test('rejects ambiguous or contradictory user contracts', () => {
  assert.throws(() => validateSpec({ ...example.spec, repro: { ...example.spec.repro, throws: 'Error' } }), /exactly one/);
  assert.throws(() => validateSpec({ ...example.spec, checks: [{ name: 'Conflict', args: [[]], expect: 9 }] }), /Conflicting/);
  assert.throws(() => validateSpec({ ...example.spec, entry: 'average; process.exit()' }), /valid JavaScript/);
  assert.throws(() => validateSpec({ ...example.spec, checks: [] }), /1–24/);
});
test('saved lessons survive restart, deduplicate, and block a later regression', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'regra-memory-'));
  try {
    const store = new Store(dir);
    await store.verify({ spec: example.spec, before: example.before, after: example.after });
    await store.verify({ spec: example.spec, before: example.before, after: example.after });
    const reopened = new Store(dir);
    assert.equal((await reopened.read()).lessons.length, 1);
    const spec = { project: example.spec.project, entry: 'average', title: 'Missing input returns zero', repro: { name: 'Missing input', args: [null], expect: 0 }, checks: [{ name: 'Positive list', args: [[2, 4]], expect: 3 }] };
    const after = 'function average(values) { if (values === null) return 0; return values.reduce((a,b)=>a+b)/values.length; }';
    const run = await reopened.verify({ spec, before: example.after, after });
    assert.equal(run.status, 'rejected');
    assert.ok(run.afterResults.some(r => r.id.startsWith('memory-') && !r.passed));
    assert.equal((await reopened.read()).lessons.length, 1);
    assert.equal((await reopened.read()).runs.length, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('corrupt state fails closed and is not overwritten', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'regra-corrupt-'));
  try {
    const file = path.join(dir, 'state.json');
    await writeFile(file, '{bad json');
    await assert.rejects(new Store(dir).verify({ spec: example.spec, before: example.before, after: example.after }), /refusing to replace/);
    assert.equal(await readFile(file, 'utf8'), '{bad json');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('a saved contract cannot be silently weakened by a new expected value', async () => {
  const saved = { ...example.spec };
  await assert.rejects(verify({ spec: { ...example.spec, repro: { ...example.spec.repro, expect: 99 } }, before: example.before, after: example.after, lessons: [saved] }), /Conflicting/);
});
test('all guided examples reject a bad fix and accept the real repair', async () => {
  for (const item of examples.slice(1)) {
    assert.equal((await verify({ spec: item.spec, before: item.before, after: item.bad })).status, 'rejected');
    assert.equal((await verify({ spec: item.spec, before: item.before, after: item.after })).status, 'verified');
  }
});
