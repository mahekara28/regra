import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { openProject, listCases } from './project.mjs';
import { connections } from './connections.mjs';
import { VERSION } from './version.mjs';

export async function probeMcp(root) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./cli.mjs', import.meta.url)), 'mcp', '--root', root], cwd: root, stderr: 'pipe', maxBufferSize: 1000000 });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr = (stderr + chunk).slice(-3000); });
  const client = new Client({ name: 'regra-doctor', version: VERSION });
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('MCP startup exceeded 15 seconds.')), 15000); });
  try {
    await Promise.race([client.connect(transport), timeout]);
    const listing = await client.listTools();
    const response = await client.callTool({ name: 'regra_status', arguments: {} });
    if (response.isError) throw new Error('MCP status returned an error.');
    const required = ['regra_status', 'regra_context', 'regra_verify', 'regra_check', 'regra_evidence', 'regra_repository'];
    if (required.some(name => !listing.tools.some(tool => tool.name === name))) throw new Error('The MCP server is missing expected tools.');
    return { passed: true, tools: listing.tools.map(t => t.name), project: response.structuredContent?.project, message: 'Real stdio discovery and status call passed. This does not observe whether your editor loaded the server.' };
  } catch (error) { return { passed: false, message: error.message, stderr }; }
  finally { clearTimeout(timer); await client.close().catch(() => {}); await transport.close().catch(() => {}); }
}
export async function doctor(root = process.cwd()) {
  const checks = [];
  const [major, minor] = process.versions.node.split('.').map(Number);
  checks.push({ name: 'Node.js', passed: major > 22 || (major === 22 && minor >= 13), detail: process.version });
  let project;
  try { project = await openProject(root); checks.push({ name: 'Project configuration', passed: true, detail: `${project.config.project} at ${project.root}` }); }
  catch (error) { checks.push({ name: 'Project configuration', passed: false, detail: error.message }); return { ready: false, checks }; }
  try { const status = await project.regra.status(); checks.push({ name: 'Evidence store', passed: true, detail: `${status.lessons} lessons; ${status.runs} runs.` }); }
  catch (error) { checks.push({ name: 'Evidence store', passed: false, detail: error.message }); }
  try {
    const cases = await listCases(project);
    checks.push({ name: 'Case contracts', passed: cases.every(c => c.valid), detail: `${cases.length} case files. ${cases.length ? '' : 'Add reviewed case files before verifying; init --demo supplies a teaching example.'}`, errors: cases.filter(c => !c.valid) });
  } catch (error) { checks.push({ name: 'Case contracts', passed: false, detail: error.message }); }
  let configured;
  try {
    configured = await connections(project.root);
    const issues = configured.filter(c => ['missing', 'modified', 'stale', 'error'].includes(c.status));
    checks.push({ name: 'Client configuration', passed: !issues.length, detail: `${configured.filter(c => c.status === 'configured').length} managed client configurations. ${issues.length ? `Review ${issues.map(c => `${c.label}: ${c.status}`).join(', ')}. For moved paths, disconnect and reconnect using this installation. ` : ''}Live editor connections are not observed.`, clients: configured });
  } catch (error) { checks.push({ name: 'Client configuration', passed: false, detail: error.message }); }
  const probe = await probeMcp(project.root);
  checks.push({ name: 'MCP protocol self-test', passed: probe.passed, detail: probe.message, ...(!probe.passed ? { stderr: probe.stderr } : {}) });
  return { ready: checks.every(c => c.passed), version: VERSION, root: project.root, project: project.config.project, checks, next: 'Restart your agent in this project, allow its normal MCP prompt, and ask it to call regra_status.' };
}
