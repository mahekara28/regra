#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { Store } from './store.mjs';
import { execute, savedCases, validateSpec, combineCases } from './core.mjs';
import { examples } from './examples.mjs';
import { VERSION } from './version.mjs';

const [command = 'help', ...args] = process.argv.slice(2);
const options = {};
try {
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) throw new Error(`Unexpected argument: ${args[i]}`);
    const name = args[i].slice(2);
    if (!['json', 'store', 'case', 'before', 'after', 'source', 'project', 'root', 'client', 'demo', 'dry-run'].includes(name)) throw new Error(`Unknown option: --${name}`);
    const boolean = ['json', 'demo', 'dry-run'].includes(name);
    if (!boolean && (!args[i + 1] || args[i + 1].startsWith('--'))) throw new Error(`Missing value for --${name}.`);
    options[name] = boolean ? true : args[++i];
  }
  const allowed = {
    init: ['root', 'project', 'demo', 'json'], connect: ['root', 'client', 'dry-run', 'json'],
    disconnect: ['root', 'client', 'json'], connections: ['root', 'json'], doctor: ['root', 'json'],
    mcp: ['root'], ui: ['root', 'store'], serve: ['root', 'store'],
    demo: ['root', 'store', 'json'], verify: ['root', 'store', 'case', 'before', 'after', 'json'],
    check: ['root', 'store', 'case', 'source', 'json'], lessons: ['root', 'store', 'json'],
    context: ['root', 'store', 'project'], help: [], '--help': [], version: [], '--version': []
  };
  if (Object.hasOwn(allowed, command)) for (const name of Object.keys(options)) {
    if (!allowed[command].includes(name)) throw new Error(`--${name} is not supported by ${command}.`);
  }
} catch (error) {
  console.error(`REGRA: ${error.message}`); process.exit(2);
}
const root = path.resolve(options.root || process.cwd());
const store = new Store(options.store || process.env.REGRA_DATA || path.join(root, '.regra'));
const needed = key => { if (typeof options[key] !== 'string' || !options[key]) throw new Error(`Add --${key}.`); return options[key]; };
const print = value => console.log(JSON.stringify(value, null, 2));
function showRun(run) {
  if (options.json) return print(run);
  console.log(`\n${run.status.toUpperCase()} · ${run.spec.title}\n${run.summary}`);
  for (const gate of run.gates) console.log(`${gate.passed ? 'PASS' : 'FAIL'}  ${gate.name}`);
  console.log(`\n${run.afterResults.length} tests × ${run.repeats} runs per version · ${run.memoryCount} saved checks considered`);
  if (run.lessonId) console.log(`Lesson saved: ${run.lessonId}`);
  console.log('Evidence applies only to these recorded cases; review the change before using it.');
}
async function main() {
  if (command === '--version' || command === 'version') { console.log(VERSION); return; }
  if (command === 'init') {
    const { initProject } = await import('./project.mjs');
    const result = await initProject({ root, project: options.project, demo: Boolean(options.demo) });
    if (options.json) print(result);
    else console.log(`REGRA initialized: ${result.config.project}\nProject: ${result.root}\nCase contracts: regra-cases/\n${result.next}`);
    return;
  }
  if (command === 'connect' || command === 'disconnect') {
    const connection = await import('./connections.mjs');
    const result = await connection[command]({ root, client: needed('client'), dryRun: Boolean(options['dry-run']) });
    if (options.json) print(result);
    else { console.log(`${result.status.toUpperCase()} · ${result.client}\n${path.join(root, result.file)}\n${result.message}`); if (options['dry-run']) console.log(`\n${result.snippet}`); }
    return;
  }
  if (command === 'connections') { const { connections } = await import('./connections.mjs'); print(await connections(root)); return; }
  if (command === 'doctor') {
    const { doctor } = await import('./doctor.mjs');
    const result = await doctor(root);
    if (options.json) print(result);
    else { console.log(`REGRA doctor · ${result.ready ? 'READY' : 'NEEDS ATTENTION'}`); for (const check of result.checks) console.log(`${check.passed ? 'PASS' : 'FAIL'}  ${check.name}: ${check.detail}`); if (result.next) console.log(`\n${result.next}`); }
    process.exitCode = result.ready ? 0 : 1; return;
  }
  if (command === 'mcp') {
    if (options.store || options.json || options.project) throw new Error('MCP uses the project configuration and its local store. Use only --root.');
    const { startMcp } = await import('./mcp.mjs'); await startMcp(root); return;
  }
  if (command === 'serve' || command === 'ui') { const { startServer } = await import('./server.mjs'); await startServer({ directory: store.directory, root }); return; }
  if (command === 'demo') {
    const example = examples[0];
    const run = await store.verify({ spec: example.spec, before: example.before, after: example.after });
    showRun(run); process.exitCode = run.status === 'verified' ? 0 : 1; return;
  }
  if (command === 'verify') {
    const spec = JSON.parse(await readFile(path.resolve(root, needed('case')), 'utf8'));
    const before = await readFile(path.resolve(root, needed('before')), 'utf8');
    const after = await readFile(path.resolve(root, needed('after')), 'utf8');
    const run = await store.verify({ spec, before, after });
    showRun(run); process.exitCode = run.status === 'verified' ? 0 : 1; return;
  }
  if (command === 'check') {
    const spec = validateSpec(JSON.parse(await readFile(path.resolve(root, needed('case')), 'utf8')));
    const state = await store.read();
    const memory = savedCases(state.lessons, spec.project, spec.entry);
    // Always include the committed case file, so a clean CI checkout still enforces it.
    const cases = combineCases([spec.repro, ...spec.checks, ...memory]);
    const results = await execute(await readFile(path.resolve(root, needed('source')), 'utf8'), spec.entry, cases);
    const passed = results.every(r => r.passed);
    if (options.json) print({ passed, results });
    else { console.log(`${passed ? 'PASS' : 'FAIL'} · ${results.length} recorded checks`); for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name} (${r.passes}/${r.repeats})`); }
    process.exitCode = passed ? 0 : 1; return;
  }
  if (command === 'lessons') {
    const { lessons } = await store.read();
    if (options.json) print({ version: 1, lessons });
    else console.log(lessons.length ? lessons.map(l => `${l.id}  ${l.project}/${l.entry}  ${l.title}`).join('\n') : 'No lessons yet. Run a verification first.');
    return;
  }
  if (command === 'context') {
    const project = needed('project');
    const lessons = (await store.read()).lessons.filter(l => l.project === project);
    console.log(`REGRA behavior contract for ${project}\nPreserve these user-reviewed expectations. Propose code changes without rewriting the tests. Run REGRA verification after the change.\n`);
    if (!lessons.length) console.log('No verified lessons recorded for this project.');
    for (const lesson of lessons) console.log(`${lesson.entry}: ${lesson.title}\n${JSON.stringify([lesson.repro, ...lesson.checks], null, 2)}\n`);
    return;
  }
  if (command !== 'help' && command !== '--help') throw new Error(`Unknown command: ${command}`);
  console.log(`REGRA ${VERSION} · verification library + agent connection\n\nregra init --root . [--project my-app] [--demo]\nregra connect --client cursor --root . [--dry-run]\nregra connections --root .\nregra disconnect --client cursor --root .\nregra doctor --root .\nregra mcp --root .\nregra ui --root .\n\nClients: cursor, claude, codex, vscode. The client starts MCP; no web server is required.\n\nregra demo\nregra verify --case examples/average.case.json --before examples/average.before.js --after examples/average.fixed.js\nregra check --case examples/average.case.json --source examples/average.fixed.js\nregra lessons [--json]\nregra context --project demo-analytics\n\nFrom a clone, replace regra with node src/cli.mjs.\nUse --store PATH for an explicit standalone evidence store; --json for structured results.\nExit codes: 0 passed/success, 1 rejected/inconclusive, 2 setup error.\nScope: reviewed synchronous JavaScript functions; no imports/exports.\nMCP availability does not force an agent to use REGRA; use required CI checks for enforcement.`);
}
main().catch(error => { if (options.json) print({ error: error.message }); else console.error(`REGRA: ${error.message}`); process.exitCode = 2; });
