import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { parse as jsonc } from 'jsonc-parser';
import { parse as toml } from 'smol-toml';
import { initProject, openProject, loadCase, listCases } from '../src/project.mjs';
import { connect, disconnect, connections, CLIENTS } from '../src/connections.mjs';

test('project init is repeatable and preserves existing project settings and demo edits', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'regra-init-'));
  try {
    await writeFile(path.join(root, '.gitignore'), 'node_modules/\n');
    await initProject({ root, project: 'custom-key', demo: true });
    await writeFile(path.join(root, 'regra-examples/average.fixed.js'), '// my change');
    await initProject({ root, demo: true });
    assert.equal(await readFile(path.join(root, 'regra-examples/average.fixed.js'), 'utf8'), '// my change');
    assert.match(await readFile(path.join(root, '.gitignore'), 'utf8'), /node_modules\/[\s\S]*\.regra\//);
    const project = await openProject(root);
    assert.equal(project.config.project, 'custom-key');
    assert.equal((await listCases(project))[0].valid, true);
    await assert.rejects(loadCase(project, '../outside.case.json'), /inside/);
    await assert.rejects(initProject({ root, project: 'changed' }), /already initialized/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing and non-directory project paths explain how to recover without creating a folder', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'regra-missing-folder-'));
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  try {
    const missing = path.join(root, 'missing-project');
    const result = spawnSync(process.execPath, [cli, 'init', '--root', missing, '--demo'], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Project folder does not exist/);
    assert.ok(result.stderr.includes(missing));
    assert.match(result.stderr, /--root \./);
    assert.doesNotMatch(result.stderr, /ENOENT|realpath|at projectRoot/);
    await assert.rejects(readFile(path.join(missing, 'regra.config.json')), { code: 'ENOENT' });
    const file = path.join(root, 'not-a-folder.txt');
    await writeFile(file, 'preserve me');
    await assert.rejects(initProject({ root: file }), /not a folder/);
    assert.equal(await readFile(file, 'utf8'), 'preserve me');
  } finally { await rm(root, { recursive: true, force: true }); }
});
for (const client of Object.keys(CLIENTS)) {
  test(`${client}: preview, install, repeat and disconnect preserve unrelated settings`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), `regra-${client}-`));
    try {
      await initProject({ root, project: 'test' });
      const info = CLIENTS[client];
      const file = path.join(root, info.file);
      await mkdir(path.dirname(file), { recursive: true });
      const original = client === 'codex' ? '# User preference\nmodel = "my-model"\n[mcp_servers.other]\ncommand = "other-command"\n' : `// User settings\n{ "${info.key}": { "other": { "command": "other-command" } }, "customSetting": true }\n`;
      await writeFile(file, original);
      assert.equal((await connect({ root, client, dryRun: true })).status, 'preview');
      assert.equal(await readFile(file, 'utf8'), original);
      assert.equal((await connect({ root, client })).status, 'configured');
      const added = await readFile(file, 'utf8');
      assert.match(added, /User (preference|settings)/);
      const parsed = client === 'codex' ? toml(added) : jsonc(added);
      assert.equal(parsed[info.key].other.command, 'other-command');
      assert.equal(parsed[info.key].regra.command, process.execPath);
      assert.equal(parsed[info.key].regra.args.at(-1), root);
      assert.equal((await connect({ root, client })).status, 'unchanged');
      assert.equal((await connections(root)).find(c => c.client === client).status, 'configured');
      await disconnect({ root, client });
      const removed = await readFile(file, 'utf8');
      const remaining = client === 'codex' ? toml(removed) : jsonc(removed);
      assert.equal(remaining[info.key].other.command, 'other-command');
      assert.equal(remaining[info.key].regra, undefined);
      assert.match(removed, /User (preference|settings)/);
      if (client === 'codex') assert.equal(remaining.model, 'my-model');
      else assert.equal(remaining.customSetting, true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
test('connection conflicts and externally modified entries are not overwritten or deleted', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'regra-conflict-'));
  try {
    await initProject({ root, project: 'test' });
    const file = path.join(root, '.mcp.json');
    const existing = JSON.stringify({ mcpServers: { regra: { command: 'user-command' } } });
    await writeFile(file, existing);
    await assert.rejects(connect({ root, client: 'claude' }), /different REGRA/);
    assert.equal(await readFile(file, 'utf8'), existing);
    await writeFile(file, '{}');
    await connect({ root, client: 'claude' });
    const changed = JSON.parse(await readFile(file, 'utf8')); changed.mcpServers.regra.env = { USER_SETTING: 'kept' };
    const manual = JSON.stringify(changed); await writeFile(file, manual);
    await assert.rejects(disconnect({ root, client: 'claude' }), /edited outside/);
    assert.equal(await readFile(file, 'utf8'), manual);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('case files with the wrong project and symlinks outside the root are rejected', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'regra-path-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'regra-outside-'));
  try {
    await initProject({ root, project: 'test', demo: true });
    const project = await openProject(root);
    const file = path.join(root, 'regra-cases/average.case.json');
    const spec = JSON.parse(await readFile(file, 'utf8')); spec.project = 'wrong'; await writeFile(file, JSON.stringify(spec));
    await assert.rejects(loadCase(project, 'regra-cases/average.case.json'), /does not match/);
    await symlink(outside, path.join(root, '.cursor'), 'junction');
    await assert.rejects(connect({ root, client: 'cursor' }), /Symlinks/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('moved installation paths are reported as stale and reconnect can repair them', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'regra-moved-'));
  try {
    await initProject({ root, project: 'test' });
    await connect({ root, client: 'cursor' });
    const file = path.join(root, '.cursor/mcp.json');
    const recordFile = path.join(root, '.regra/connections.json');
    const config = JSON.parse(await readFile(file, 'utf8'));
    const record = JSON.parse(await readFile(recordFile, 'utf8'));
    config.mcpServers.regra.args[0] = path.join(root, 'previous-install', 'cli.mjs');
    record.clients.cursor.entry = config.mcpServers.regra;
    await writeFile(file, JSON.stringify(config));
    await writeFile(recordFile, JSON.stringify(record));
    assert.equal((await connections(root)).find(c => c.client === 'cursor').status, 'stale');
    await disconnect({ root, client: 'cursor' });
    await connect({ root, client: 'cursor' });
    assert.equal((await connections(root)).find(c => c.client === 'cursor').status, 'configured');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unsupported dry-run options cannot silently mutate a project', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'regra-dry-run-'));
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  try {
    const init = spawnSync(process.execPath, [cli, 'init', '--root', root, '--dry-run'], { encoding: 'utf8', windowsHide: true });
    assert.equal(init.status, 2);
    await assert.rejects(readFile(path.join(root, 'regra.config.json')), { code: 'ENOENT' });
    await initProject({ root, project: 'test' });
    await connect({ root, client: 'cursor' });
    const file = path.join(root, '.cursor/mcp.json');
    const before = await readFile(file, 'utf8');
    const result = spawnSync(process.execPath, [cli, 'disconnect', '--root', root, '--client', 'cursor', '--dry-run'], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /not supported/);
    assert.equal(await readFile(file, 'utf8'), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});
