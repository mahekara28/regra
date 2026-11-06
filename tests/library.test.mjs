import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRegra, verify, summarizeRun } from '@mahekara28/regra';
import { examples } from '../src/examples.mjs';

test('public package import verifies, persists and checks behavior without a web server', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'regra-library-'));
  try {
    const e = examples[0];
    const regra = createRegra({ project: e.spec.project, directory });
    const run = await regra.verify({ spec: e.spec, before: e.before, after: e.after });
    assert.equal(summarizeRun(run).canProceed, true);
    assert.equal((await regra.status()).lessons, 1);
    assert.equal((await regra.context({ entry: 'average' })).contracts.length, 1);
    assert.equal((await regra.evidence(run.id)).afterHash, run.afterHash);
    const restarted = createRegra({ project: e.spec.project, directory });
    assert.equal((await restarted.check({ source: e.bad, entry: 'average' })).status, 'rejected');
    assert.equal((await restarted.check({ source: e.after, spec: e.spec })).passed, true);
    assert.equal((await restarted.check({ source: 'function other() { return 1; }', entry: 'other' })).status, 'inconclusive');
    assert.equal((await restarted.lessons({ query: 'empty' })).total, 1);
    assert.equal((await restarted.lessons({ query: 'absent' })).total, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('a library instance cannot access or verify a different project', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'regra-scope-'));
  try {
    const e = examples[0];
    const a = createRegra({ project: e.spec.project, directory });
    const b = createRegra({ project: 'another-project', directory });
    const run = await a.verify({ spec: e.spec, before: e.before, after: e.after });
    await assert.rejects(b.verify({ spec: e.spec, before: e.before, after: e.after }), /scoped/);
    assert.equal((await b.lessons()).total, 0);
    await assert.rejects(b.evidence(run.id), /No evidence/);
    await assert.rejects(a.check({ spec: e.spec, entry: 'other', source: e.after }), /match/);
    await assert.rejects(a.lessons({ limit: -1 }), /limit/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('stateless verification remains available without writing a store', async () => {
  const e = examples[0];
  assert.equal((await verify({ spec: e.spec, before: e.before, after: e.after })).status, 'verified');
});
