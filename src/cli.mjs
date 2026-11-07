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
    if (!['json', 'store', 'case', 'before', 'after', 'source', 'project', 'root', 'client', 'demo', 'dry-run', 'baseline', 'candidate', 'trusted', 'install-deps', 'timeout', 'plan-hash', 'id'].includes(name)) throw new Error(`Unknown option: --${name}`);
    const boolean = ['json', 'demo', 'dry-run', 'trusted', 'install-deps'].includes(name);
    if (!boolean && (!args[i + 1] || args[i + 1].startsWith('--'))) throw new Error(`Missing value for --${name}.`);
    options[name] = boolean ? true : args[++i];
  }
  const allowed = {
    inspect: ['root', 'candidate', 'json'],
    'repo-verify': ['root', 'baseline', 'candidate', 'trusted', 'install-deps', 'timeout', 'plan-hash', 'dry-run', 'json'],
    'repo-check': ['root', 'baseline', 'candidate', 'trusted', 'install-deps', 'timeout', 'plan-hash', 'dry-run', 'json'],
    'repo-evidence': ['root', 'id', 'json'],
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
  if (['inspect', 'repo-verify', 'repo-check', 'repo-evidence'].includes(command)) {
    const repo = await import('./repository/index.mjs');
    if (command === 'inspect') {
      const report = await repo.inspectRepository({ root, revision: options.candidate || 'HEAD' });
      if (options.json) print(report);
      else {
        console.log(`REGRA project inspection\nProject: ${report.root}\nCommit: ${report.revision.commit}\nAdapter: ${report.adapter}\nTest command: ${report.testScript || 'Node test discovery'}\nTest files: ${report.testFiles.length}`);
        for (const file of report.testFiles) console.log('  ' + file);
        for (const blocker of report.blockers) console.log('Needs attention: ' + blocker.detail);
        if (report.dirty) console.log('Working changes exist and are excluded from committed-revision verification.');
        console.log('\n' + report.next);
      }
      return;
    }
    if (command === 'repo-evidence') {
      const proof = await repo.readRepositoryProof({ root, id: needed('id') });
      if (options.json) print(proof);
      else console.log(`${proof.status.toUpperCase()} · ${proof.summary}\nBaseline: ${proof.plan.baseline.commit}\nCandidate: ${proof.plan.candidate.commit}\nProof: ${proof.id}\n${proof.proofPath}`);
      return;
    }
    const request = { root, baseline: needed('baseline'), candidate: options.candidate || 'HEAD', trusted: Boolean(options.trusted), installDependencies: Boolean(options['install-deps']), ...(options.timeout !== undefined ? { timeoutMs: Number(options.timeout) } : {}), expectedPlanHash: options['plan-hash'] };
    if (options['dry-run']) {
      const plan = await repo.planRepository(request);
      if (options.json) print(plan);
      else {
        console.log(`REGRA execution preview · ${plan.ready ? 'READY FOR REVIEW' : 'NEEDS ATTENTION'}\nProject: ${plan.root}\nBaseline: ${plan.baseline.commit}\nCandidate: ${plan.candidate.commit}\n${plan.testFiles.length} test files · ${plan.contractFiles.length} frozen contract files · 3 runs per revision\nPlan hash: ${plan.planHash}`);
        for (const item of [...plan.warnings, ...plan.blockers.map(blocker => blocker.detail)]) console.log(item);
        console.log('No tests ran and no setup files changed. Review the plan, then add --trusted for reviewed code. Snapshots are not a security sandbox.');
      }
      process.exitCode = plan.ready ? 0 : 1; return;
    }
    if (!options.json) request.onProgress = ({ side, repeat, repeats }) => console.error(`Checking ${side === 'before' ? 'baseline' : 'candidate'} · run ${repeat}/${repeats}`);
    const proof = await (command === 'repo-check' ? repo.checkRepository(request) : repo.verifyRepository(request));
    if (options.json) print(proof);
    else {
      console.log(`\n${proof.status.toUpperCase()} · ${proof.summary}\nBaseline: ${proof.plan.baseline.commit}\nCandidate: ${proof.plan.candidate.commit}\nProof: ${proof.id}\nSaved: ${proof.proofPath}`);
      const results = proof.afterRuns.at(-1)?.results || [];
      for (const test of results.filter(test => !test.passed && test.type !== 'suite')) console.log(`FAIL  ${test.file}: ${test.name}\n${test.error?.message || ''}`);
    }
    process.exitCode = proof.canProceed ? 0 : 1; return;
  }
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
  console.log('Repository commands (committed Node projects):\nregra inspect --root .\nregra repo-verify --baseline main --candidate HEAD --dry-run\nregra repo-verify --baseline main --candidate HEAD --trusted [--install-deps] [--json]\nregra repo-check --baseline main --candidate HEAD --trusted\nregra repo-evidence --id PROOF_ID [--json]\nUse --timeout MILLISECONDS for test runs and --plan-hash HASH to bind execution to a preview.\n');
  console.log(`REGRA ${VERSION} · verification library + agent connection\n\nregra init --root . [--project my-app] [--demo]\nregra connect --client cursor --root . [--dry-run]\nregra connections --root .\nregra disconnect --client cursor --root .\nregra doctor --root .\nregra mcp --root .\nregra ui --root .\n\nClients: cursor, claude, codex, vscode. The client starts MCP; no web server is required.\n\nregra demo\nregra verify --case examples/average.case.json --before examples/average.before.js --after examples/average.fixed.js\nregra check --case examples/average.case.json --source examples/average.fixed.js\nregra lessons [--json]\nregra context --project demo-analytics\n\nFrom a clone, replace regra with node src/cli.mjs.\nUse --store PATH for an explicit standalone evidence store; --json for structured results.\nExit codes: 0 passed/success, 1 rejected/inconclusive, 2 setup error.\nFunction commands: reviewed synchronous JavaScript functions; no imports/exports. Repository commands support committed JavaScript modules through node:test.\nMCP availability does not force an agent to use REGRA; use required CI checks for enforcement.`);
}
main().catch(error => { if (options.json) print({ error: error.message }); else console.error(`REGRA: ${error.message}`); process.exitCode = 2; });
