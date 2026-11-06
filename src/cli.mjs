#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { Store } from './store.mjs';
import { execute, savedCases, validateSpec, combineCases } from './core.mjs';
import { examples } from './examples.mjs';
import { startServer } from './server.mjs';

const [command = 'help', ...args] = process.argv.slice(2);
const options = {};
try {
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) throw new Error(`Unexpected argument: ${args[i]}`);
    const name = args[i].slice(2);
    if (!['json', 'store', 'case', 'before', 'after', 'source', 'project'].includes(name)) throw new Error(`Unknown option: --${name}`);
    if (name !== 'json' && (!args[i + 1] || args[i + 1].startsWith('--'))) throw new Error(`Missing value for --${name}.`);
    options[name] = name === 'json' ? true : args[++i];
  }
} catch (error) {
  console.error(`REGRA: ${error.message}`); process.exit(2);
}
const store = new Store(options.store || process.env.REGRA_DATA || path.resolve('.regra'));
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
  if (command === 'serve') { await startServer({ directory: store.directory }); return; }
  if (command === 'demo') {
    const example = examples[0];
    const run = await store.verify({ spec: example.spec, before: example.before, after: example.after });
    showRun(run); process.exitCode = run.status === 'verified' ? 0 : 1; return;
  }
  if (command === 'verify') {
    const spec = JSON.parse(await readFile(needed('case'), 'utf8'));
    const before = await readFile(needed('before'), 'utf8');
    const after = await readFile(needed('after'), 'utf8');
    const run = await store.verify({ spec, before, after });
    showRun(run); process.exitCode = run.status === 'verified' ? 0 : 1; return;
  }
  if (command === 'check') {
    const spec = validateSpec(JSON.parse(await readFile(needed('case'), 'utf8')));
    const state = await store.read();
    const memory = savedCases(state.lessons, spec.project, spec.entry);
    // Always include the committed case file, so a clean CI checkout still enforces it.
    const cases = combineCases([spec.repro, ...spec.checks, ...memory]);
    const results = await execute(await readFile(needed('source'), 'utf8'), spec.entry, cases);
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
  if (command !== 'help') throw new Error(`Unknown command: ${command}`);
  console.log(`REGRA · local app + executable lessons\n\nnode src/cli.mjs serve\nnode src/cli.mjs demo\nnode src/cli.mjs verify --case examples/average.case.json --before examples/average.before.js --after examples/average.fixed.js\nnode src/cli.mjs check --case examples/average.case.json --source examples/average.fixed.js\nnode src/cli.mjs lessons [--json]\nnode src/cli.mjs context --project demo-analytics\n\nUse --store PATH for a separate lesson library; --json for machine-readable results.\nExit codes: 0 passed/success, 1 rejected/inconclusive, 2 setup error.\nScope: reviewed, self-contained synchronous JavaScript functions; no imports/exports.`);
}
main().catch(error => { if (options.json) print({ error: error.message }); else console.error(`REGRA: ${error.message}`); process.exitCode = 2; });
