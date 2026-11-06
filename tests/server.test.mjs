import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/server.mjs';
import { examples } from '../src/examples.mjs';

test('HTTP flow: session checks, actual verification, durable history and exports', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'regra-http-'));
  const server = createApp({ directory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /REGRA/);
    const initial = await (await fetch(base + '/api/state')).json();
    assert.equal(initial.lessons.length, 0);
    const example = examples[0];
    const body = JSON.stringify({ spec: example.spec, before: example.before, after: example.after });
    const noToken = await fetch(base + '/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(noToken.status, 403);
    const folderHeaders = { 'Content-Type': 'application/json', 'X-Regra-Token': initial.token };
    const noFolderToken = await fetch(base + '/api/project-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ root: directory }) });
    assert.equal(noFolderToken.status, 403);
    const folder = await fetch(base + '/api/project-folder', { method: 'POST', headers: folderHeaders, body: JSON.stringify({ root: directory }) });
    assert.equal(folder.status, 200); assert.match((await folder.json()).message, /Folder found/);
    const missingFolder = await fetch(base + '/api/project-folder', { method: 'POST', headers: folderHeaders, body: JSON.stringify({ root: path.join(directory, 'missing') }) });
    assert.equal(missingFolder.status, 400); assert.match((await missingFolder.json()).error, /does not exist/);
    const relativeFolder = await fetch(base + '/api/project-folder', { method: 'POST', headers: folderHeaders, body: JSON.stringify({ root: '.' }) });
    assert.equal(relativeFolder.status, 400);
    const crossOrigin = await fetch(base + '/api/state', { headers: { Origin: 'https://unrelated.example' } });
    assert.equal(crossOrigin.status, 403);
    const wrongHostStatus = await new Promise((resolve, reject) => {
      const request = http.get(base + '/api/state', { headers: { Host: 'unrelated.example' } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
    });
    assert.equal(wrongHostStatus, 403);
    const response = await fetch(base + '/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Regra-Token': initial.token }, body });
    assert.equal(response.status, 200); assert.equal((await response.json()).status, 'verified');
    const refreshed = await (await fetch(base + '/api/state')).json();
    assert.equal(refreshed.lessons.length, 1); assert.equal(refreshed.runs.length, 1);
    const exported = await (await fetch(base + '/api/export')).json(); assert.equal(exported.lessons.length, 1);
    const traversal = await fetch(base + '/src/core.mjs'); assert.equal(traversal.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
