import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./runner.cjs', import.meta.url));
const own = (object, key) => Object.hasOwn(object, key);
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const REPEATS = 3;

function fail(message) { throw new Error(message); }
function shortText(value, label, max = 150) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} must be 1–${max} characters.`);
  return value.trim();
}
function jsonValue(value, depth = 0) {
  if (depth > 20) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => jsonValue(item, depth + 1));
  return value && Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(item => jsonValue(item, depth + 1));
}
export function validateCase(value, id = 'repro') {
  if (!value || typeof value !== 'object') fail('Each test must be an object.');
  const name = shortText(value.name, 'Test name');
  if (!Array.isArray(value.args) || !jsonValue(value.args) || JSON.stringify(value.args).length > 8000) fail('Test args must be a JSON array, up to 8 KB.');
  if (own(value, 'expect') === own(value, 'throws')) fail('Each test needs exactly one of expect or throws.');
  if (own(value, 'expect') && (!jsonValue(value.expect) || JSON.stringify(value.expect).length > 8000)) fail('Expected output must be a finite JSON value, up to 8 KB.');
  if (own(value, 'throws') && (typeof value.throws !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(value.throws))) fail('throws must be an error name, such as TypeError.');
  return { id, name, args: structuredClone(value.args), ...(own(value, 'expect') ? { expect: structuredClone(value.expect) } : { throws: value.throws }) };
}
export function validateSource(value, label = 'Source code') {
  if (typeof value !== 'string' || !value.trim() || value.length > 24000) fail(`${label} must be 1–24,000 characters.`);
  return value;
}
export function validateSpec(value) {
  if (!value || typeof value !== 'object') fail('A case specification is required.');
  const project = shortText(value.project, 'Project', 80);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(project)) fail('Project must use letters, numbers, dots, dashes or underscores.');
  const entry = shortText(value.entry, 'Function name', 80);
  if (!/^[a-zA-Z_$][\w$]*$/.test(entry) || ['eval', 'arguments', 'undefined', 'null'].includes(entry)) fail('Use a valid JavaScript function name.');
  const title = shortText(value.title, 'Lesson title');
  if (!Array.isArray(value.checks) || value.checks.length < 1 || value.checks.length > 24) fail('Add 1–24 existing-behavior tests in checks.');
  const spec = { project, entry, title, repro: validateCase(value.repro), checks: value.checks.map((c, i) => validateCase(c, `check-${i}`)) };
  assertConsistent([spec.repro, ...spec.checks]);
  return spec;
}
function assertConsistent(cases) {
  for (let i = 0; i < cases.length; i++) {
    for (let j = 0; j < i; j++) {
      if (isDeepStrictEqual(cases[i].args, cases[j].args) && !sameExpectation(cases[i], cases[j])) fail('Conflicting expected outputs for the same input. Review the intended behavior before verifying.');
    }
  }
}
function sameExpectation(a, b) {
  return own(a, 'expect') === own(b, 'expect') && (own(a, 'expect') ? isDeepStrictEqual(a.expect, b.expect) : a.throws === b.throws);
}
function uniqueCases(cases) {
  const result = [];
  for (const item of cases) if (!result.some(other => isDeepStrictEqual(other.args, item.args) && sameExpectation(other, item))) result.push(item);
  return result;
}
export function combineCases(cases) {
  assertConsistent(cases);
  return uniqueCases(cases);
}
export function savedCases(lessons, project, entry) {
  return uniqueCases(lessons.filter(l => l.project === project && l.entry === entry).flatMap(l => [l.repro, ...l.checks])).map((c, i) => validateCase(c, `memory-${i}`));
}
export function execute(source, entry, cases, repeats = REPEATS) {
  validateSource(source);
  if (cases.length > 100) fail('This prototype supports at most 100 active tests per function.');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--permission', `--allow-fs-read=${runner}`, '--max-old-space-size=96', runner], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), ...(process.env.TEMP ? { TEMP: process.env.TEMP } : {}) }
    });
    let output = '', errors = '', stopped = false;
    const abort = message => { if (!stopped) { stopped = true; child.kill(); reject(new Error(message)); } };
    const timer = setTimeout(() => abort('Runner exceeded its 15-second limit. No fix was accepted.'), 15000);
    child.stdout.on('data', data => { output += data; if (output.length > 4000000) abort('Runner output is too large.'); });
    child.stderr.on('data', data => { errors = (errors + data).slice(-2000); });
    child.on('error', error => { clearTimeout(timer); if (!stopped) { stopped = true; reject(error); } });
    child.stdin.on('error', () => {});
    child.on('close', code => {
      clearTimeout(timer);
      if (stopped) return;
      stopped = true;
      if (code !== 0) return reject(new Error(`Runner stopped (${code}). ${errors}`));
      try {
        const results = JSON.parse(output);
        if (!Array.isArray(results) || results.length !== cases.length * repeats) throw new Error('Incomplete runner output.');
        const records = cases.map(test => {
          const observations = results.filter(r => r.id === test.id);
          if (observations.length !== repeats || observations.some(r => !['return', 'throw', 'invalid'].includes(r.kind))) throw new Error('Invalid runner output.');
          const valid = observations.every(r => r.kind !== 'invalid');
          const matches = r => own(test, 'throws') ? r.kind === 'throw' && r.name === test.throws : r.kind === 'return' && isDeepStrictEqual(r.value, test.expect);
          const passes = observations.filter(matches).length;
          return { ...test, valid, passes, repeats, stable: passes === 0 || passes === repeats, passed: valid && passes === repeats, observations };
        });
        resolve(records);
      } catch (error) { reject(new Error(`Runner output could not be verified: ${error.message}`)); }
    });
    child.stdin.end(JSON.stringify({ source, entry, cases, repeats }));
  });
}
export async function verify({ spec: rawSpec, before, after, lessons = [] }) {
  const spec = validateSpec(rawSpec);
  validateSource(before, 'Original code'); validateSource(after, 'Proposed code');
  const memory = savedCases(lessons, spec.project, spec.entry);
  const cases = combineCases([spec.repro, ...spec.checks, ...memory]);
  const beforeResults = await execute(before, spec.entry, cases);
  const afterResults = await execute(after, spec.entry, cases);
  const originalBug = beforeResults[0];
  const reproduction = originalBug.valid && originalBug.passes === 0;
  const oldBehavior = beforeResults.filter(r => r.id.startsWith('check-')).every(r => r.passed);
  const fixed = afterResults[0].passed;
  const protectedBehavior = afterResults.slice(1).every(r => r.passed);
  const stable = [...beforeResults, ...afterResults].every(r => r.stable && r.valid);
  const accepted = reproduction && oldBehavior && fixed && protectedBehavior && stable;
  const status = accepted ? 'verified' : (!stable || !reproduction || !oldBehavior ? 'inconclusive' : 'rejected');
  let summary;
  if (accepted) summary = 'The bug is reproduced, the fix passes, and all recorded behavior stays intact.';
  else if (!stable) summary = 'A test was unstable or could not run. Fix the test setup or code before trusting this result.';
  else if (!reproduction) summary = 'The original code already passes this bug test. It does not reproduce the reported failure.';
  else if (!oldBehavior) summary = 'An existing-behavior test fails on the original code. Review the starting point or expected behavior.';
  else if (!fixed) summary = 'The proposed fix still fails the bug test.';
  else summary = 'The proposed fix solves this bug but breaks other recorded behavior.';
  return {
    id: randomUUID(), createdAt: new Date().toISOString(), status, summary, spec,
    beforeHash: hash(before), afterHash: hash(after), before, after,
    runtime: process.version, platform: process.platform, repeats: REPEATS,
    memoryCount: memory.length, beforeResults, afterResults,
    gates: [
      { name: 'Bug reproduced', passed: reproduction, detail: 'The original code must fail the new test on all three runs.' },
      { name: 'Starting checks valid', passed: oldBehavior, detail: 'Existing-behavior tests must pass before the change.' },
      { name: 'Fix works', passed: fixed, detail: 'The proposed code must pass the new test on all three runs.' },
      { name: 'Earlier behavior protected', passed: protectedBehavior, detail: 'Existing checks and saved lessons must pass after the change.' },
      { name: 'Repeat check', passed: stable, detail: 'Three runs must agree on pass/fail, without runner errors. This samples repeatability, not proof of determinism.' }
    ]
  };
}
export function lessonFrom(run) {
  if (run.status !== 'verified') fail('Only verified runs can create a lesson.');
  return { id: hash([run.spec.project, run.spec.entry, run.spec.repro.args, run.spec.repro.expect, run.spec.repro.throws]).slice(0, 16),
    ...run.spec, createdAt: run.createdAt, evidenceRun: run.id, beforeHash: run.beforeHash, afterHash: run.afterHash, runtime: run.runtime };
}
