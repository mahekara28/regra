# Verify a real Node repository

This local beta runs the same committed Node test suite against two exact Git revisions. It uses the existing computer, Git and Node. No API key, model, account or hosted service is required.

Start with a standalone JavaScript project whose test command is a plain `node --test`, optionally followed by test paths/globs. Node imports and exports are supported here. Vitest, Jest, TypeScript loaders, workspace packages, arbitrary shell scripts and lifecycle setup steps need later adapters.

## First run

Use Node.js 22.13+ and Git. Update your local REGRA installation after changing this checkout:

```powershell
npm install --global .
```

Open a terminal in the existing Git project to verify:

```powershell
regra inspect --root .
regra repo-verify --root . --baseline main --candidate HEAD --dry-run
```

Replace `main` with the local commit or branch containing the original bug, and `HEAD` with the proposed fix. Both must already exist locally. The commands do not fetch, commit, switch branches, change the index, connect an agent or modify setup files.

The preview lists exact commit IDs, discovered tests, the frozen contract and blockers. Working changes are reported and **excluded**. Commit work manually before including it in this adapter's comparison.

After reviewing the project and tests:

```powershell
regra repo-verify --root . --baseline main --candidate HEAD --trusted
```

`--trusted` explicitly allows the selected repository's code to execute on this computer. The separate snapshots prevent ordinary test writes from changing the checkout. They are **not a security sandbox**: trusted tests can still access host files, processes and the network. Do not use this host adapter for unknown or hostile code. OS/container isolation is required before automating that scope.

Optionally add `--plan-hash HASH` using the hash from your preview. A moved branch or changed contract then prevents execution until you review a fresh plan. A hash detects changes; it does not establish human review.

If the project needs installed dependencies and has an unchanged committed `package-lock.json`:

```powershell
regra repo-verify --root . --baseline main --candidate HEAD --trusted --install-deps
```

This explicitly allows npm to fetch locked dependencies. REGRA runs `npm ci --ignore-scripts --no-audit --no-fund` in each disposable snapshot. It never copies the current checkout's node_modules, runs lifecycle scripts or generates a lockfile. If native/build dependencies need those scripts, verification remains inconclusive until a supported setup adapter exists. Without this option, missing imports are reported as setup failures, not repaired bugs.

## What gets checked

1. Resolve both refs to immutable commits and read exact Git blobs. No checkout hooks, Git filters or archive substitutions run.
2. Discover tests from the committed package configuration. Preserve every existing test and known fixture byte-for-byte; changed/deleted contracts, changed test commands or dependency contracts require separate review.
3. Freeze the candidate's test files and known test/fixture directories, including added regression cases. Overlay that same contract on the baseline. A new bug test must fail against old code, not only pass against new code.
4. Run baseline and candidate **three times each**, from fresh snapshots. Capture named test results, failures, runtime, commands, revisions, fingerprints and timing.
5. Reject incomplete fixes and recurrent failures. Return inconclusive for setup errors, timeouts, skipped/TODO/empty tests, changed runtime test identities, flaky results, or a contract modified during execution.
6. Write one immutable proof under `.regra/repository/proofs/PROOF_ID.json` and clean the snapshots.

For a **repair**, at least one named baseline test must fail and at least one must pass; every candidate test must pass consistently. For a regression-only gate, use:

```powershell
regra repo-check --root . --baseline main --candidate HEAD --trusted
```

This compares and protects the baseline's existing contract but does not require a previously failing test or claim a bug was repaired. It is useful for CI-compatible callers; installation of hooks/workflows and durable repository-lesson replay are the next milestone.

## Read a decision

- **VERIFIED / exit 0:** the selected mode's acceptance rules passed for these recorded tests.
- **REJECTED / exit 1:** the candidate still fails a recorded behavior check.
- **INCONCLUSIVE / exit 1:** the result cannot support acceptance; inspect the reason.
- **Setup/input error / exit 2:** invalid arguments, unavailable refs/repository or missing trusted-code acknowledgment.

Only verified results set `canProceed: true`. Green test output or exit code alone is insufficient.

```powershell
regra repo-verify --baseline main --candidate HEAD --trusted --json
regra repo-evidence --id YOUR_PROOF_ID
regra repo-evidence --id YOUR_PROOF_ID --json
```

Proofs include observed failures and logs, which may contain project-specific data. Keep `.regra/` in your project's .gitignore; `regra init` already adds that rule. There is no automatic upload. Repository proofs are separate from the existing function lessons and dashboard history. This milestone does not claim to turn whole-repository tests into persistent reusable lessons yet.

`--timeout 30000` is the default per test run, with a 100–300000 ms range. Dependency setup has a separate 120-second limit. Output, snapshot and test-count limits fail closed instead of silently dropping evidence.

## Library

```js
import {
  inspectRepository, planRepository, verifyRepository,
  checkRepository, readRepositoryProof
} from '@mahekara28/regra';

const selection = { root: '/existing/project', baseline: 'main', candidate: 'HEAD' };
const inspection = await inspectRepository({ root: selection.root });
const plan = await planRepository(selection);
// Show the plan to the user before this explicit trusted-code operation.
const proof = await verifyRepository({
  ...selection,
  trusted: true,
  expectedPlanHash: plan.planHash,
  timeoutMs: 30_000
});
console.log(proof.status, proof.reason, proof.proofPath);
const recorded = await readRepositoryProof({ root: selection.root, id: proof.id });
// For a regression-only gate: checkRepository({ ...selection, trusted: true }).
```

Inspection and planning are read-only. Execution writes a unique proof file and temporary snapshots. Repository APIs and CLI commands share the same implementation and acceptance rules.

## Agent connection

The existing MCP connection exposes `regra_repository` with three read-only actions:

```json
{"action":"inspect"}
{"action":"plan","baseline":"main","candidate":"HEAD"}
{"action":"evidence","id":"PROOF_UUID"}
```

It uses the MCP server's selected project root. It returns bounded summaries and cannot accept an execution/trust flag. An agent can explain the plan and inspect a completed proof; a human or explicitly trusted library/CLI workflow controls host execution. Existing function-level MCP tools still work.

## Current boundaries

- Committed standalone Node/JavaScript projects only; no uncommitted snapshots, workspaces, submodules, symlinks or nonportable Git paths.
- Up to 5,000 tracked files / 30 MB per revision, 200 test files, and 2,000 result events per run. Truncated output is inconclusive.
- Existing files under test/tests/__tests__/__snapshots__/fixtures and selected test paths form the frozen contract. Helpers outside those paths, dynamic imports, environment-driven behavior and the intent of assertions still require review. Byte fingerprints cannot prove semantic adequacy or defeat a malicious test.
- No automatic code edits, merge, commit, push, publication, agent configuration, hook installation or dependency download.
- No cache of accepted results, SQLite, paid AI service, mandatory Ollama or vector database.
- The conformance fixtures demonstrate adapter behavior. They are not the proposed 20–30 independently reviewed real-bug evaluation.

Implementation stages and acceptance criteria: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Commit these implementation changes manually

Use eight commits in this order. Each captures a distinct component: bounded process execution, Git snapshots, verification policy, the public typed API, CLI, MCP, integration coverage, and documentation. Each group depends only on earlier groups. The repository integration tests exercise both CLI and MCP, so commit them after those interfaces.

```powershell
cd "C:\Users\Mehek\Documents\Codex\2026-11-06\can-reject-a-solution-that-fails\outputs\regra"
git status

# 1. Bounded subprocess execution and structured Node test results
git add src/repository/process.mjs src/repository/node-worker.mjs
git diff --cached --stat
git commit -m "feat: add bounded Node test execution and structured results"

# 2. Exact Git snapshots, test discovery and contract fingerprints
git add src/repository/snapshot.mjs
git diff --cached --stat
git commit -m "feat: discover Node tests and materialize exact Git snapshots"

# 3. Shared acceptance rules, repeatability and saved proofs
git add src/repository/index.mjs
git diff --cached --stat
git commit -m "feat: verify repository repairs and retain proof reports"

# 4. Public library exports, TypeScript declarations and type checks
git add src/index.mjs src/index.d.ts tests/types.test.ts
git diff --cached --stat
git commit -m "feat: expose typed repository verification APIs"

# 5. Project inspection, preview and verification commands
git add src/cli.mjs
git diff --cached --stat
git commit -m "feat: add repository inspection and verification CLI"

# 6. Agent inspection and proof retrieval
git add src/mcp.mjs src/doctor.mjs tests/mcp.test.mjs
git diff --cached --stat
git commit -m "feat: expose read-only repository tools through MCP"

# 7. Git history integration tests and package coverage
git add tests/repository.test.mjs scripts/package-smoke.mjs
git diff --cached --stat
git commit -m "test: cover repository verification and packaged adapters"

# 8. Usage, limitations, validation and the staged roadmap
git add README.md docs/API.md docs/CONNECTIONS.md docs/PRODUCT.md docs/VALIDATION.md docs/IMPLEMENTATION_PLAN.md docs/REPOSITORIES.md
git diff --cached --stat
git commit -m "docs: document repository verification and implementation roadmap"

git status
git log --oneline -8
git push origin main
```

One push publishes all eight commits with their individual messages and history.

The local implementation does not publish to npm or change GitHub branch protection. Hosted checks run after your push; the local validation record does not establish their result.

Reference: the adapter consumes the official Node [test runner events](https://github.com/nodejs/node/blob/v22.13.0/doc/api/test.md#class-testsstream) and materializes exact blobs using Git [ls-tree](https://git-scm.com/docs/git-ls-tree) and [cat-file](https://git-scm.com/docs/git-cat-file).
