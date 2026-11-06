import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { initProject } from '../src/project.mjs';
import { examples } from '../src/examples.mjs';
import { doctor } from '../src/doctor.mjs';

test('real MCP client discovers tools and verifies, persists, checks and retrieves scoped evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'regra-mcp-'));
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp', '--root', root], stderr: 'pipe' });
  let errors = ''; transport.stderr.on('data', chunk => { errors += chunk; });
  const client = new Client({ name: 'regra-integration-test', version: '1.0.0' });
  try {
    await initProject({ root, project: 'mcp-test', demo: true });
    await client.connect(transport);
    const list = await client.listTools();
    assert.deepEqual(list.tools.map(t => t.name).sort(), ['regra_status', 'regra_context', 'regra_verify', 'regra_check', 'regra_evidence'].sort());
    const call = (name, args = {}) => client.callTool({ name, arguments: args });
    assert.equal((await call('regra_status')).structuredContent.project, 'mcp-test');
    const contract = (await call('regra_context', { entry: 'average' })).structuredContent.cases[0];
    assert.equal(contract.caseFile, 'regra-cases/average.case.json');
    const caseHash = contract.caseHash;
    const bad = await call('regra_verify', { caseFile: contract.caseFile, caseHash, before: examples[0].before, after: examples[0].bad });
    assert.equal(bad.structuredContent.status, 'rejected'); assert.equal(bad.structuredContent.canProceed, false);
    const good = await call('regra_verify', { caseFile: contract.caseFile, caseHash, before: examples[0].before, after: examples[0].after });
    assert.equal(good.structuredContent.canProceed, true);
    const proof = await call('regra_evidence', { runId: good.structuredContent.id });
    assert.equal(proof.structuredContent.after, examples[0].after);
    assert.equal((await call('regra_context', { entry: 'average' })).structuredContent.total, 1);
    const regression = await call('regra_check', { caseFile: 'regra-cases/average.case.json', source: examples[0].bad });
    assert.equal(regression.structuredContent.canProceed, false);
    const escape = await call('regra_verify', { caseFile: '../outside.case.json', caseHash, before: examples[0].before, after: examples[0].after });
    assert.equal(escape.isError, true);
    const inlineContract = await call('regra_verify', { caseFile: contract.caseFile, caseHash, before: examples[0].before, after: examples[0].after, spec: { expect: 99 } });
    assert.equal(inlineContract.isError, true);
    const casePath = path.join(root, contract.caseFile);
    const changed = JSON.parse(await readFile(casePath, 'utf8')); changed.title = 'A changed contract';
    await writeFile(casePath, JSON.stringify(changed));
    const stale = await call('regra_verify', { caseFile: contract.caseFile, caseHash, before: examples[0].before, after: examples[0].after });
    assert.equal(stale.isError, true); assert.match(stale.content[0].text, /changed after retrieval/);
    assert.equal((await client.listResources()).resources[0].uri, 'regra://project');
    assert.match((await client.readResource({ uri: 'regra://project' })).contents[0].text, /mcp-test/);
    assert.equal((await client.listPrompts()).prompts[0].name, 'repair_with_regra');
    assert.match((await client.getPrompt({ name: 'repair_with_regra', arguments: { functionName: 'average' } })).messages[0].content.text, /regra_verify/);
    assert.match(errors, /stdio/);
  } finally { await client.close(); await transport.close(); await rm(root, { recursive: true, force: true }); }
});
test('2025-era MCP initialize handshake and discovery remain compatible', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'regra-legacy-'));
  let child, lines;
  const pending = new Map();
  try {
    await initProject({ root, project: 'legacy-test' });
    child = spawn(process.execPath, [fileURLToPath(new URL('../src/cli.mjs', import.meta.url)), 'mcp', '--root', root], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    child.stderr.resume();
    lines = createInterface({ input: child.stdout });
    lines.on('line', line => { const message = JSON.parse(line); pending.get(message.id)?.(message); });
    let id = 0;
    const request = (method, params) => new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => { pending.delete(current); reject(new Error('Legacy MCP response timed out.')); }, 12000);
      pending.set(current, message => { clearTimeout(timer); pending.delete(current); resolve(message); });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: current, method, params }) + '\n');
    });
    const initialized = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'legacy-test', version: '1.0.0' } });
    assert.match(initialized.result.protocolVersion, /^2025-/);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const listed = await request('tools/list', {}); assert.equal(listed.result.tools.length, 5);
    const status = await request('tools/call', { name: 'regra_status', arguments: {} });
    assert.equal(status.result.structuredContent.project, 'legacy-test');
  } finally {
    lines?.close(); child?.kill();
    if (child && child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    await rm(root, { recursive: true, force: true });
  }
});
test('doctor performs an actual protocol check and reports an uninitialized project', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'regra-doctor-'));
  try {
    assert.equal((await doctor(root)).ready, false);
    await initProject({ root, project: 'doctor-test', demo: true });
    const result = await doctor(root);
    assert.equal(result.ready, true, JSON.stringify(result));
    assert.equal(result.checks.find(c => c.name === 'MCP protocol self-test').passed, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
