import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { examples, verifyPrepared, retainLesson, replayLesson, sourceOf } from '../site/demo.mjs';
import { examples as engineExamples } from '../src/examples.mjs';
import { execute, validateSpec } from '../src/core.mjs';
import { buildSite, buildDirectory, publicFiles } from '../scripts/site/build.mjs';
import { createPreviewServer } from '../scripts/site/preview.mjs';

test('public examples reject incomplete repairs, retain only verified lessons, and catch their original bugs', () => {
  for (const example of examples) {
    const rejected = verifyPrepared(example, 'incomplete');
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.after[0].passed, true);
    assert.throws(() => retainLesson(example, rejected));
    assert.throws(() => replayLesson(example, null));
    const verified = verifyPrepared(example, 'correct');
    assert.equal(verified.status, 'verified');
    assert.ok(verified.before.slice(1).every(result => result.passed));
    assert.ok(verified.after.every(result => result.observations.length === 3 && result.passed));
    const lesson = retainLesson(example, verified);
    assert.notEqual(lesson.cases, example.cases);
    const replay = replayLesson(example, lesson);
    assert.equal(replay.caught, true);
    assert.equal(replay.results[0].passed, false);
    assert.throws(() => verifyPrepared(example, 'arbitrary-source'));
    const other = examples.find(item => item.id !== example.id);
    assert.throws(() => retainLesson(other, verified));
    assert.throws(() => replayLesson(other, lesson));
  }
});

test('browser example outcomes agree with the installed engine and its shipped contracts', async () => {
  for (const example of examples) {
    const shipped = engineExamples.find(item => item.id === example.id);
    assert.ok(shipped);
    const spec = validateSpec(shipped.spec);
    const contract = [spec.repro, ...spec.checks];
    assert.deepEqual(example.cases.map(({ args, expect }) => ({ args, expect })), contract.map(({ args, expect }) => ({ args, expect })));
    for (const [candidate, engineSource] of [['incomplete', shipped.bad], ['correct', shipped.after]]) {
      const expected = verifyPrepared(example, candidate).after.map(item => item.passed);
      const browserSourceInEngine = await execute(sourceOf(example[candidate]), example.entry, contract);
      const shippedSourceInEngine = await execute(engineSource, example.entry, contract);
      assert.deepEqual(browserSourceInEngine.map(item => item.passed), expected);
      assert.deepEqual(shippedSourceInEngine.map(item => item.passed), expected);
    }
  }
});

test('Pages build contains only public assets; preview serves project paths and excludes private files', async t => {
  await buildSite();
  const generated = (await readdir(buildDirectory, { recursive: true, withFileTypes: true })).filter(item => item.isFile()).map(item => path.relative(buildDirectory, path.join(item.parentPath, item.name)).split(path.sep).join('/')).sort();
  assert.deepEqual(generated, [...publicFiles].sort());
  const html = await readFile(path.join(buildDirectory, 'index.html'), 'utf8');
  for (const reference of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) assert.ok(publicFiles.includes(reference[1]), `Missing asset ${reference[1]}`);
  for (const link of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${link[1]}"`), `Missing anchor ${link[1]}`);
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const file of publicFiles) assert.equal((await fetch(`${base}/regra/${file}`)).status, 200, file);
  assert.equal((await fetch(`${base}/regra/`)).status, 200);
  assert.equal((await fetch(`${base}/regra`, { redirect: 'manual' })).headers.get('location'), '/regra/');
  for (const file of ['.regra/state.json', '.codex/config.toml', '.git/config', 'README.md', '../package.json', '%2e%2e%2fpackage.json', 'nested/missing']) {
    const response = await fetch(`${base}/regra/${file}`);
    assert.equal(response.status, 404, file);
    assert.match(await response.text(), /This path has no page/);
  }
  assert.equal((await fetch(`${base}/regra/`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/regra/main.mjs`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await fetch(`${base}/regra/`, { method: 'HEAD' })).status, 200);
});
