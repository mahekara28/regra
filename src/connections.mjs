import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, mkdir, unlink } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { parse as parseJsonc, modify, applyEdits } from 'jsonc-parser';
import { parse as parseToml } from 'smol-toml';
import { inside, readText, atomicWrite } from './files.mjs';
import { openProject } from './project.mjs';

export const CLIENTS = Object.freeze({
  cursor: { label: 'Cursor', file: '.cursor/mcp.json', key: 'mcpServers' },
  claude: { label: 'Claude Code', file: '.mcp.json', key: 'mcpServers' },
  codex: { label: 'Codex', file: '.codex/config.toml', key: 'mcp_servers' },
  vscode: { label: 'VS Code', file: '.vscode/mcp.json', key: 'servers' }
});
const begin = '# BEGIN REGRA MANAGED MCP';
const end = '# END REGRA MANAGED MCP';
const cliFile = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const descriptor = client => { if (!Object.hasOwn(CLIENTS, client)) throw new Error('Choose cursor, claude, codex, or vscode.'); return CLIENTS[client]; };
function parse(text, client) {
  if (!text?.trim()) return {};
  if (client === 'codex') return structuredClone(parseToml(text));
  const errors = [];
  const value = parseJsonc(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The existing MCP configuration is not a valid JSON object. It was left unchanged.');
  return value;
}
function getEntry(text, client) {
  const value = parse(text, client);
  const parent = value[descriptor(client).key];
  if (parent !== undefined && (!parent || typeof parent !== 'object' || Array.isArray(parent))) throw new Error('The MCP server collection must be an object.');
  const entry = parent?.regra;
  if (entry !== undefined && (!entry || typeof entry !== 'object' || Array.isArray(entry))) throw new Error('The REGRA MCP entry must be an object.');
  return entry;
}
export function connectionPlan(root, client) {
  const info = descriptor(client);
  const base = { command: process.execPath, args: [cliFile, 'mcp', '--root', root] };
  const entry = client === 'codex' ? { ...base, startup_timeout_sec: 20, tool_timeout_sec: 60 } : ['claude', 'vscode'].includes(client) ? { type: 'stdio', ...base } : base;
  const toml = `${begin}\n[mcp_servers.regra]\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(entry.args)}\nstartup_timeout_sec = 20\ntool_timeout_sec = 60\n${end}`;
  return { client, label: info.label, file: info.file, entry, snippet: client === 'codex' ? toml : JSON.stringify({ [info.key]: { regra: entry } }, null, 2) };
}
function edit(text, client, value) {
  if (client !== 'codex') {
    const edits = modify(text || '{}\n', [descriptor(client).key, 'regra'], value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: text?.includes('\r\n') ? '\r\n' : '\n' } });
    const next = applyEdits(text || '{}\n', edits);
    parse(next, client);
    return next.endsWith('\n') ? next : next + '\n';
  }
  const start = text.indexOf(begin), finish = text.indexOf(end);
  if (value === undefined) {
    if (start < 0 || finish < start || text.indexOf(begin, start + begin.length) >= 0) throw new Error('The REGRA TOML block is missing or ambiguous. No configuration was changed.');
    // Only remove a block that parses to exactly the REGRA entry: never swallow other tables.
    const block = text.slice(start + begin.length, finish);
    const parsed = structuredClone(parseToml(block));
    if (!isDeepStrictEqual(parsed, { mcp_servers: { regra: getEntry(text, client) } })) throw new Error('The managed block contains additional settings. Remove it manually after reviewing those settings.');
    const next = text.slice(0, start) + text.slice(finish + end.length).replace(/^\r?\n/, '');
    parse(next, client); return next;
  }
  if (start >= 0 || finish >= 0) throw new Error('An existing REGRA block is incomplete. Review it before reconnecting.');
  const block = connectionPlan(value.args[value.args.length - 1], client).snippet;
  const next = `${text}${text && !text.endsWith('\n') ? '\n' : ''}\n${block}\n`;
  parse(next, client); return next;
}
async function records(root) {
  const file = await inside(root, '.regra/connections.json');
  const text = await readText(file, { optional: true });
  if (!text) return { version: 1, clients: {} };
  const value = JSON.parse(text);
  if (value.version !== 1 || !value.clients || typeof value.clients !== 'object' || Array.isArray(value.clients)) throw new Error('Invalid connection records. Refusing to overwrite them.');
  return value;
}
async function withLock(root, operation) {
  const lockFile = await inside(root, '.regra/connections.lock');
  await mkdir(path.dirname(lockFile), { recursive: true });
  let handle;
  try { handle = await open(lockFile, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Another connection change is in progress. Retry when it finishes.'); throw error; }
  try { return await operation(); }
  finally { await handle.close(); await unlink(lockFile); }
}
export async function connect({ root = process.cwd(), client, dryRun = false } = {}) {
  const project = await openProject(root); root = project.root;
  const plan = connectionPlan(root, client);
  const file = await inside(root, plan.file);
  const operation = async () => {
    const text = await readText(file, { optional: true }) || '';
    const current = getEntry(text, client);
    if (current !== undefined && !isDeepStrictEqual(current, plan.entry)) throw new Error('A different REGRA entry already exists. No settings were overwritten. Disconnect the managed entry or review the existing configuration first.');
    const record = await records(root);
    const next = current !== undefined ? text : edit(text, client, plan.entry);
    if (dryRun) return { ...plan, root, status: 'preview', message: 'Preview only. Run without --dry-run to install this project connection.' };
    // Recheck before replace so a concurrent manual edit is not silently discarded.
    if ((await readText(file, { optional: true }) || '') !== text) throw new Error('Configuration changed during setup. Retry.');
    if (next !== text) await atomicWrite(file, next);
    record.clients[client] = { entry: plan.entry, file: plan.file, connectedAt: new Date().toISOString(), removable: client !== 'codex' || next.includes(begin) };
    try { await atomicWrite(await inside(root, '.regra/connections.json'), JSON.stringify(record, null, 2) + '\n'); }
    catch (error) {
      if (next !== text && (await readText(file, { optional: true })) === next) await atomicWrite(file, text);
      throw error;
    }
    return { ...plan, root, status: current !== undefined ? 'unchanged' : 'configured', message: 'Configuration saved. Restart the agent in this project and accept its normal MCP/trust prompt. Run regra doctor to test the protocol; configuration alone does not prove the editor loaded it.' };
  };
  return dryRun ? operation() : withLock(root, operation);
}
export async function disconnect({ root = process.cwd(), client } = {}) {
  const project = await openProject(root); root = project.root;
  const info = descriptor(client);
  return withLock(root, async () => {
    const record = await records(root);
    const managed = record.clients[client];
    if (!managed) throw new Error('REGRA has no managed connection for this client. No configuration was changed.');
    const file = await inside(root, info.file);
    const text = await readText(file, { optional: true }) || '';
    const current = getEntry(text, client);
    if (current !== undefined && !isDeepStrictEqual(current, managed.entry)) throw new Error('The REGRA entry was edited outside this tool. No configuration was changed.');
    if (current !== undefined && !managed.removable) throw new Error('This entry was configured manually. Remove it manually after review.');
    const next = current === undefined ? text : edit(text, client, undefined);
    if ((await readText(file, { optional: true }) || '') !== text) throw new Error('Configuration changed during disconnect. Retry.');
    if (next !== text) await atomicWrite(file, next);
    delete record.clients[client];
    await atomicWrite(await inside(root, '.regra/connections.json'), JSON.stringify(record, null, 2) + '\n');
    return { client, root, file: info.file, status: 'disconnected', message: 'Removed only the managed REGRA entry. Evidence and other server settings remain.' };
  });
}
export async function connections(root) {
  const project = await openProject(root); root = project.root;
  const record = await records(root);
  const results = [];
  for (const [client, info] of Object.entries(CLIENTS)) {
    try {
      const current = getEntry(await readText(await inside(root, info.file), { optional: true }), client);
      const managed = record.clients[client];
      const status = !current ? (managed ? 'missing' : 'not-configured') : !managed ? 'manual' : !isDeepStrictEqual(current, managed.entry) ? 'modified' : isDeepStrictEqual(current, connectionPlan(root, client).entry) ? 'configured' : 'stale';
      results.push({ client, label: info.label, file: info.file, status, liveConnection: 'not-observed' });
    } catch (error) { results.push({ client, label: info.label, file: info.file, status: 'error', error: error.message, liveConnection: 'not-observed' }); }
  }
  return results;
}
