import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdtemp, realpath, lstat, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { inside, projectRoot, readText } from '../files.mjs';
import { VERSION } from '../version.mjs';
import { git, repositoryRoot, revision, blobs, detect, digest, materialize, changedContract } from './snapshot.mjs';
import { runProcess } from './process.mjs';

const worker = fileURLToPath(new URL('./node-worker.mjs', import.meta.url));
const REPEATS = 3;
const viewRevision = rev => ({ ref: rev.ref, commit: rev.commit, tree: rev.tree, fileCount: rev.files.length });
const issue = (code, detail) => ({ code, detail });
const SCOPE = 'Only the frozen committed Node test suite was checked. Disposable snapshots are not a security sandbox. Use reviewed, trusted code; no model or cloud service is involved.';

async function prepare({ root = process.cwd(), baseline, candidate = 'HEAD' } = {}) {
  root = await repositoryRoot(root);
  const before = await revision(root, baseline);
  const after = await revision(root, candidate);
  const content = await blobs(root, [...before.files, ...after.files]);
  const detectedBefore = detect(before, content), detectedAfter = detect(after, content);
  const blockers = [...detectedBefore.blockers, ...detectedAfter.blockers];
  const contracts = detectedAfter.contractFiles;
  const oldPaths = new Map(before.files.map(file => [file.path, file]));
  const newPaths = new Map(after.files.map(file => [file.path, file]));
  for (const file of detectedBefore.contractFiles) {
    if (newPaths.get(file.path)?.oid !== file.oid || newPaths.get(file.path)?.mode !== file.mode) blockers.push(issue('contract_changed', 'Existing test or fixture changed/deleted: ' + file.path + '. Review the contract separately before verifying the repair.'));
  }
  if (detectedBefore.testScript !== detectedAfter.testScript) blockers.push(issue('test_command_changed', 'The test command changed between revisions. Establish the reviewed test command before the repair.'));
  if (detectedBefore.dependencyFingerprint !== detectedAfter.dependencyFingerprint) blockers.push(issue('dependencies_changed', 'Dependency declarations or package-lock.json changed. This adapter requires the same dependency contract on both sides.'));
  const contractHash = digest(contracts.map(({ path, oid, mode }) => ({ path, oid, mode })));
  const dirty = Boolean((await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal'])).length);
  const plan = {
    kind: 'regra-repository-plan', version: 1, root, adapter: 'node-test',
    baseline: viewRevision(before), candidate: viewRevision(after),
    testScript: detectedAfter.testScript, testFiles: detectedAfter.testFiles,
    contractFiles: contracts.map(({ path, oid, mode }) => ({ path, oid, mode })), contractHash,
    changedFiles: [...new Set([...oldPaths.keys(), ...newPaths.keys()])].filter(file => oldPaths.get(file)?.oid !== newPaths.get(file)?.oid || oldPaths.get(file)?.mode !== newPaths.get(file)?.mode).sort(),
    addedTestFiles: detectedAfter.testFiles.filter(file => !oldPaths.has(file)),
    dependencies: detectedAfter.dependencies, hasLockfile: detectedAfter.hasLockfile,
    dependencyFingerprint: detectedAfter.dependencyFingerprint,
    dirty, warnings: dirty ? ['Uncommitted and untracked changes are excluded. Only the exact commits shown here will execute.'] : [],
    blockers, ready: !blockers.length, repeats: REPEATS, requiresTrust: true, scope: SCOPE
  };
  plan.planHash = digest({ baseline: before.commit, candidate: after.commit, contractHash, testFiles: plan.testFiles, dependencyFingerprint: plan.dependencyFingerprint });
  return { plan, before, after, content, contracts };
}

export async function inspectRepository({ root = process.cwd(), revision: ref = 'HEAD' } = {}) {
  root = await repositoryRoot(root);
  const rev = await revision(root, ref);
  const content = await blobs(root, rev.files.filter(file => file.path === 'package.json'));
  const found = detect(rev, content);
  return { kind: 'regra-repository-inspection', root, revision: viewRevision(rev), adapter: found.adapter, packageName: found.packageName, testScript: found.testScript, testFiles: found.testFiles, contractFiles: found.contractFiles.map(file => file.path), dependencies: found.dependencies, hasLockfile: found.hasLockfile, supported: !found.blockers.length, blockers: found.blockers, dirty: Boolean((await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal'])).length), next: 'Review committed tests, then preview with regra repo-verify --baseline <broken-ref> --candidate <fixed-ref> --dry-run. Add --trusted only for code you have reviewed.', scope: SCOPE };
}
export async function planRepository(options) { return (await prepare(options)).plan; }

async function npmExecutable() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    ...String(process.env.PATH || '').split(path.delimiter).map(directory => path.join(directory, 'npm'))
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const resolved = await realpath(candidate);
      if (path.basename(resolved) === 'npm-cli.js' && (await lstat(resolved)).isFile()) return resolved;
    } catch {}
  }
  throw new Error('npm CLI could not be found. Run this through an npm script or install npm beside Node.');
}
function identity(result) {
  return JSON.stringify([result.file, result.line, result.column, result.nesting, result.name, result.type]);
}
function signature(run) {
  return digest(run.results.map(result => [identity(result), result.passed, result.skipped, result.todo, result.error]));
}
function setupProblem(run) {
  if (run.timedOut) return issue('timeout', 'The test command exceeded its time limit.');
  if (run.outputLimit) return issue('output_limit', 'Test output exceeded the bounded capture limit.');
  if (run.error || run.workerError || !run.summary || !Array.isArray(run.results)) return issue('runner_error', run.error || 'The runner did not return complete structured evidence.');
  if (![0, 1].includes(run.exitCode) || run.signal) return issue('runner_exit', 'The runner exited unexpectedly.');
  if (run.truncated) return issue('truncated_evidence', 'The runner produced more results or logs than this beta can verify.');
  if (run.results.some(result => result.fileWrapper && !result.passed)) return issue('setup_failure', 'A test file failed to load or exited unexpectedly. Inspect the captured dependency/syntax diagnostics.');
  if (!run.summary.counts?.tests || !run.results.some(result => result.type !== 'suite' && !result.fileWrapper)) return issue('no_executed_tests', 'No named node:test tests executed. A file exiting successfully is not verification.');
  if (run.summary.counts.cancelled) return issue('cancelled_tests', 'One or more tests were cancelled or timed out.');
  if (run.results.some(result => result.skipped || result.todo)) return issue('inactive_tests', 'Skipped or TODO tests are not accepted as verified behavior.');
  if (run.results.some(result => result.fileWrapper)) return issue('setup_failure', 'A test file failed to load, exited unexpectedly or defined no tests. Inspect the captured diagnostics.');
  const setupCodes = new Set(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_UNKNOWN_FILE_EXTENSION', 'ERR_REQUIRE_ESM', 'ERR_DLOPEN_FAILED']);
  for (const result of run.results) {
    if (result.passed) continue;
    const error = result.error;
    if (!['testCodeFailure', 'subtestsFailed'].includes(error?.failureType) || [error?.code, error?.cause?.code, error?.cause?.cause?.code].some(code => setupCodes.has(code))) return issue('setup_failure', 'A runner, hook or dependency error prevented a behavior check.');
  }
  const allPassed = run.results.every(result => result.passed);
  if (allPassed !== run.summary.success || allPassed !== (run.exitCode === 0)) return issue('inconsistent_report', 'Exit status, test events and runner summary disagree.');
  return null;
}
function decision(proof) {
  const before = proof.beforeRuns, after = proof.afterRuns;
  const failures = [...before, ...after].map(setupProblem).filter(Boolean);
  if (failures.length) return { status: 'inconclusive', reason: failures[0] };
  if (new Set(before.map(signature)).size !== 1 || new Set(after.map(signature)).size !== 1) return { status: 'inconclusive', reason: issue('unstable_results', 'Repeated runs produced different test identities, outcomes or failure details.') };
  if (JSON.stringify(before[0].results.map(identity)) !== JSON.stringify(after[0].results.map(identity))) return { status: 'inconclusive', reason: issue('test_set_changed', 'The baseline and candidate executed different tests despite using the same frozen files.') };
  const failed = after[0].results.filter(result => result.type !== 'suite' && !result.passed);
  if (failed.length) return { status: 'rejected', reason: issue('tests_failed', failed.length + ' candidate behavior check(s) still fail.') };
  if (proof.mode === 'repair' && !before[0].results.some(result => result.type !== 'suite' && !result.passed)) return { status: 'inconclusive', reason: issue('not_reproduced', 'The baseline already passes. No repaired failure was reproduced; use repo-check for a regression-only gate.') };
  if (proof.mode === 'repair' && !before[0].results.some(result => result.type !== 'suite' && result.passed)) return { status: 'inconclusive', reason: issue('no_preservation_check', 'Add at least one check of existing passing behavior before claiming a repair.') };
  return { status: 'verified', reason: issue(proof.mode === 'repair' ? 'repair_verified' : 'checks_passed', proof.mode === 'repair' ? 'The baseline failure was reproduced, every candidate test passed, and earlier passing behavior was preserved across three runs.' : 'The frozen test suite passed three times on the candidate. This is a regression check, not a repair claim.') };
}

async function capture(directory, testFiles, timeoutMs) {
  const result = await runProcess(process.execPath, [worker], { cwd: directory, input: JSON.stringify({ files: testFiles }), timeoutMs });
  let report = {};
  try { report = JSON.parse(result.stdout.toString('utf8')); } catch {}
  const normalize = value => typeof value === 'string' ? value.split(directory).join('[snapshot]').split(directory.split(path.sep).join('/')).join('[snapshot]') : value;
  report = JSON.parse(JSON.stringify(report, (_key, value) => normalize(value)));
  return { ...report, results: report.results || [], exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut, outputLimit: result.outputLimit, error: result.error, durationMs: result.durationMs, stderr: normalize(result.stderr.toString('utf8').slice(0, 32000)) };
}
async function cleanScratch(directory, parent) {
  const stat = await lstat(directory);
  if (path.dirname(directory) !== parent || !path.basename(directory).startsWith('regra-repository-') || !stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== directory) throw new Error('Refusing cleanup of an unexpected snapshot directory.');
  await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
async function persist(root, proof) {
  const file = await inside(root, '.regra/repository/proofs/' + proof.id + '.json');
  await mkdir(path.dirname(file), { recursive: true });
  proof.proofPath = file;
  await writeFile(file, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
}
async function evaluate(options, mode) {
  const { trusted = false, installDependencies = false, timeoutMs = 30000, expectedPlanHash, onProgress } = options || {};
  if (trusted !== true) throw new Error('Repository tests execute code on this computer. Preview first, then explicitly pass --trusted (library: trusted: true) for reviewed code. Snapshots are not a security sandbox.');
  if (typeof installDependencies !== 'boolean' || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300000) throw new Error('timeoutMs must be an integer from 100 to 300000; installDependencies must be boolean.');
  if (expectedPlanHash !== undefined && !/^[a-f0-9]{64}$/.test(expectedPlanHash)) throw new Error('expectedPlanHash must be the planHash from a preview.');
  const { plan, before, after, content, contracts } = await prepare(options);
  const proof = {
    kind: 'regra-repository-proof', version: 1, id: randomUUID(), createdAt: new Date().toISOString(), mode,
    status: 'inconclusive', canProceed: false, plan, repeats: REPEATS,
    environment: { node: process.version, git: (await git(plan.root, ['--version'])).toString().trim(), npm: null, platform: process.platform, arch: process.arch, regra: VERSION, workerHash: digest(await readFile(worker)), dependencyFingerprint: plan.dependencyFingerprint, environmentPolicy: 'allowlisted platform/path/home/locale variables; Node loaders and CI credentials are not inherited' },
    execution: { executable: process.execPath, arguments: [worker], input: { files: plan.testFiles }, runnerOptions: { concurrency: 1, isolation: 'process' }, timeoutMs, dependencyInstall: installDependencies ? ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'] : null },
    beforeRuns: [], afterRuns: [], installations: [], findings: [...plan.blockers], scope: SCOPE
  };
  if (expectedPlanHash && expectedPlanHash !== plan.planHash) proof.findings.push(issue('stale_plan', 'The revisions or test contract changed since preview. Review the new plan.'));
  if (installDependencies && !plan.hasLockfile) proof.findings.push(issue('lockfile_required', 'Commit package-lock.json before requesting npm ci. REGRA does not generate or update dependency locks.'));
  let scratch, scratchRoot;
  try {
    if (!proof.findings.length) {
      const npm = installDependencies ? await npmExecutable() : null;
      if (npm) {
        const version = await runProcess(process.execPath, [npm, '--version'], { cwd: plan.root });
        if (version.exitCode !== 0) throw new Error('Could not identify the npm runtime.');
        proof.environment.npm = version.stdout.toString().trim();
      }
      // Windows TEMP can use an 8.3 alias. Keep one canonical parent for creation and cleanup.
      scratchRoot = await realpath(tmpdir());
      scratch = await mkdtemp(path.join(scratchRoot, 'regra-repository-'));
      const contractMap = new Map(contracts.map(file => [file.path, file]));
      // Both sides receive exactly the candidate's frozen tests and fixtures.
      const baselineFiles = [...before.files.filter(file => !contractMap.has(file.path)), ...contracts];
      for (let repeat = 1; repeat <= REPEATS && !proof.findings.length; repeat++) {
        for (const [side, files] of [['before', baselineFiles], ['after', after.files]]) {
          onProgress?.({ side, repeat, repeats: REPEATS });
          const directory = path.join(scratch, side + '-' + repeat);
          await materialize(directory, files, content);
          if (npm) {
            const install = await runProcess(process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(scratch, 'npm-cache')], { cwd: directory, timeoutMs: 120000 });
            const installation = { side, repeat, exitCode: install.exitCode, timedOut: install.timedOut, durationMs: install.durationMs, log: (install.stdout.toString() + install.stderr.toString()).slice(0, 32000) };
            proof.installations.push(installation);
            if (install.exitCode !== 0 || install.timedOut || install.outputLimit || install.error) { proof.findings.push(issue('dependency_setup_failed', 'npm ci did not complete. Inspect the installation log; no verification was granted.')); break; }
          }
          const mutatedBySetup = await changedContract(directory, contracts, content);
          if (mutatedBySetup) { proof.findings.push(issue('contract_mutated', 'Setup changed a frozen test: ' + mutatedBySetup)); break; }
          const run = await capture(directory, plan.testFiles, timeoutMs);
          run.repeat = repeat;
          proof[side === 'before' ? 'beforeRuns' : 'afterRuns'].push(run);
          const mutated = await changedContract(directory, contracts, content);
          if (mutated) proof.findings.push(issue('contract_mutated', 'Execution changed a frozen test or fixture: ' + mutated));
          const invalid = setupProblem(run);
          if (invalid) proof.findings.push(invalid);
          if (proof.findings.length) break;
        }
      }
    }
  } catch (error) {
    proof.findings.push(issue('setup_error', error.message));
  } finally {
    if (scratch) {
      try { await cleanScratch(scratch, scratchRoot); }
      catch (error) { proof.findings.push(issue('cleanup_error', error.message)); }
    }
  }
  const result = proof.findings.length ? { status: 'inconclusive', reason: proof.findings[0] } : decision(proof);
  proof.status = result.status;
  proof.canProceed = result.status === 'verified';
  proof.reason = result.reason;
  proof.summary = result.reason.detail;
  proof.completedAt = new Date().toISOString();
  await persist(plan.root, proof);
  return proof;
}
export async function verifyRepository(options) { return evaluate(options, 'repair'); }
export async function checkRepository(options) { return evaluate(options, 'check'); }
export async function readRepositoryProof({ root = process.cwd(), id } = {}) {
  root = await projectRoot(root);
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Provide the repository proof ID.');
  const proof = JSON.parse(await readText(await inside(root, '.regra/repository/proofs/' + id + '.json'), { maxBytes: 20_000_000 }));
  if (proof.kind !== 'regra-repository-proof' || proof.version !== 1 || proof.id !== id) throw new Error('Unsupported or mismatched repository evidence.');
  return proof;
}
