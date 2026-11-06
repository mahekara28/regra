import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
test('CLI exit codes enforce a committed case and do not double-count stored lessons', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'regra-cli-'));
  const cli = args => spawnSync(process.execPath, ['src/cli.mjs', ...args, '--store', directory], { cwd, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  try {
    assert.equal(cli(['demo']).status, 0);
    const result = cli(['check', '--case', 'examples/average.case.json', '--source', 'examples/average.fixed.js', '--json']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).results.length, 5);
    assert.equal(cli(['check', '--case', 'examples/average.case.json', '--source', 'examples/average.broken.js']).status, 1);
    assert.equal(cli(['verify', '--case', 'missing-file.json', '--before', 'a', '--after', 'b']).status, 2);
    assert.equal(cli(['verify', '--unrecognized']).status, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
