import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { examples, verifyPrepared, retainLesson, replayLesson, sourceOf, contractOf } from '../site/demo.mjs';
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
    const copiedContract = validateSpec(contractOf(example));
    assert.equal(copiedContract.project, shipped.spec.project);
    assert.equal(copiedContract.entry, shipped.spec.entry);
    assert.deepEqual([copiedContract.repro, ...copiedContract.checks].map(({ args, expect }) => ({ args, expect })), example.cases.map(({ args, expect }) => ({ args, expect })));
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
  assert.equal((await fetch(`${base}/regra/theme.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await fetch(`${base}/regra/assets/fonts/instrument-sans-latin.woff2`)).headers.get('content-type'), 'font/woff2');
  assert.equal((await fetch(`${base}/regra/`, { method: 'HEAD' })).status, 200);
});

// Run the actual pre-paint script with browser event/storage boundaries.
const themeSource = await readFile(new URL('../site/theme.js', import.meta.url), 'utf8');
function themeBrowser({ systemDark = false, stored = null, storageDenied = false } = {}) {
  const listeners = {}, clicks = {};
  const root = { dataset: {} }, meta = {}, label = {};
  const button = { hidden: true, setAttribute(name, value) { this[name] = value; }, addEventListener(name, listener) { clicks[name] = listener; } };
  const media = { matches: systemDark, addEventListener(name, listener) { listeners.media = listener; } };
  const storage = { getItem() { if (storageDenied) throw Error('denied'); return stored; }, setItem(key, value) { if (storageDenied) throw Error('denied'); stored = value; } };
  let ready = false;
  runInNewContext(themeSource, {
    document: {
      documentElement: root, querySelector: () => meta,
      getElementById: id => ready ? ({ 'theme-toggle': button, 'theme-label': label }[id] || null) : null,
      addEventListener(name, listener) { listeners[name] = listener; }
    },
    window: { matchMedia: () => media, addEventListener(name, listener) { listeners[name] = listener; } },
    localStorage: storage
  });
  return {
    root, button, meta, label, stored: () => stored,
    ready() { ready = true; listeners.DOMContentLoaded(); },
    click() { clicks.click(); },
    system(dark) { media.matches = dark; listeners.media(); },
    storage(key, newValue) { listeners.storage({ key, newValue }); }
  };
}

test('theme follows the system before paint, then respects a saved manual choice', () => {
  const browser = themeBrowser({ systemDark: true });
  assert.equal(browser.root.dataset.theme, 'dark');
  assert.equal(browser.meta.content, '#21151f');
  browser.ready();
  assert.equal(browser.button.hidden, false);
  assert.equal(browser.button['aria-pressed'], 'true');
  browser.system(false);
  assert.equal(browser.root.dataset.theme, 'light');
  browser.click();
  assert.equal(browser.stored(), 'dark');
  browser.system(false);
  assert.equal(browser.root.dataset.theme, 'dark');
  const reloaded = themeBrowser({ stored: browser.stored() });
  assert.equal(reloaded.root.dataset.theme, 'dark');
});

test('theme remains usable when storage is denied and ignores invalid preferences', () => {
  const denied = themeBrowser({ storageDenied: true, systemDark: true });
  denied.ready();
  denied.click();
  assert.equal(denied.root.dataset.theme, 'light');
  assert.equal(denied.meta.content, '#f0f0e9');
  assert.equal(denied.label.textContent, 'Day');
  denied.system(true);
  assert.equal(denied.root.dataset.theme, 'light');
  const invalid = themeBrowser({ stored: 'unexpected', systemDark: true });
  assert.equal(invalid.root.dataset.theme, 'dark');
  invalid.system(false);
  assert.equal(invalid.root.dataset.theme, 'light');
});

test('theme synchronizes across tabs and returns to the system after clearing the preference', () => {
  const browser = themeBrowser();
  browser.ready();
  browser.storage('another-setting', 'dark');
  assert.equal(browser.root.dataset.theme, 'light');
  browser.storage('regra-theme', 'dark');
  assert.equal(browser.root.dataset.theme, 'dark');
  browser.storage('regra-theme', null);
  assert.equal(browser.root.dataset.theme, 'light');
  browser.system(true);
  assert.equal(browser.root.dataset.theme, 'dark');
  browser.storage(null, null);
  browser.system(false);
  assert.equal(browser.root.dataset.theme, 'light');
});
