# REGRA

**Every fix earns its proof.**

REGRA turns a reproducible coding mistake into a test that protects future changes. It is a local app for learning and inspecting fixes, with a command-line engine underneath. This is a working v0.1 prototype, not a hosted service.

## Start in two minutes

You need **Node.js 22.13 or later**. There are no npm dependencies to install.

On Windows, double-click **Start-Regra.cmd**. Or open a terminal in this folder and run:

```sh
npm start
```

Open **http://127.0.0.1:4317**. Keep the terminal open while using the app.

1. Choose **An empty list**. The function crashes for `average([])`.
2. Click **Try a broken fix**, then **Verify this fix**. It stops the crash but breaks normal calculations, so REGRA rejects it.
3. Click **Load example fix**, then verify again. The test fails before the fix, passes afterward, and existing behavior remains intact.
4. Open **Lesson library**. The verified behavior is now recorded on disk.
5. Try another change with the same project key and function name. Those lessons run again automatically.

The examples contain deliberately chosen product rules. For example, an empty average returns zero in the demo; that is not a universal mathematical definition. Review the expected behavior for your own app.

## What works today

- A responsive local app with three guided examples and editable custom functions.
- Real execution of original and proposed code; no simulated test results.
- A regression gate: a fix that breaks a recorded behavior is rejected.
- Three repeated runs per case and per version, with a fresh execution context for each case.
- Separate statuses: **verified**, **rejected**, and **inconclusive**.
- Persistent lessons, run history, source fingerprints, runtime version, observed outputs, and JSON exports.
- Optional AI repair drafts from installed **local** Ollama models. Drafts never skip verification.
- A CLI for verification, regression checks, JSON results, and context for other coding assistants.
- No account, API key, cloud storage, telemetry, or runtime package dependencies.

## What the first version supports

Self-contained, **synchronous JavaScript functions**, written as plain function declarations:

```js
function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
```

Inputs and returned values must be JSON-compatible. Tests can also expect a named thrown error such as `TypeError`. No imports, exports, package dependencies, browser APIs, asynchronous code, dates, undefined, NaN, or cyclic objects. Results use exact equality, including floating-point numbers.

It does **not** yet connect to entire repositories, retrain models, run browser tests, create pull requests, or automatically apply fixes. The example fixes are labeled teaching examples; only **Ask local AI** calls a model.

## Use the CLI

Run these commands from this folder. All examples below are single-line commands and work in PowerShell or Bash.

```sh
node src/cli.mjs demo
node src/cli.mjs verify --case examples/average.case.json --before examples/average.before.js --after examples/average.fixed.js
node src/cli.mjs verify --case examples/average.case.json --before examples/average.before.js --after examples/average.broken.js
node src/cli.mjs check --case examples/average.case.json --source examples/average.fixed.js
node src/cli.mjs lessons --json
node src/cli.mjs context --project demo-analytics
```

The broken example intentionally exits with code 1. Exit codes are **0** for passed/success, **1** for rejected or inconclusive, and **2** for setup errors. Add `--json` to verification or checks for machine-readable evidence. Use `--store PATH` to separate lesson libraries between projects.

`check` always includes the provided case file, even on a new machine with no history. Commit reviewed case files to your own repository and run this command in your existing CI to enforce those behaviors. Native `.js` test-runner adapters are a later milestone.

A case file has this shape:

```json
{
  "project": "my-app",
  "entry": "average",
  "title": "An empty list returns zero",
  "repro": { "name": "Empty list", "args": [[]], "expect": 0 },
  "checks": [
    { "name": "Positive values", "args": [[2, 4]], "expect": 3 }
  ]
}
```

`args` is the array of arguments passed to the function. If the function takes one list, wrap that list: `[[]]` calls `average([])`. To expect an error, replace `"expect": 0` with `"throws": "TypeError"`.

## Optional local AI

Install Ollama and download a suitable local model if you do not have one. Start Ollama before opening REGRA, or refresh REGRA after Ollama starts. Select an installed model and choose **Ask local AI**. The code and test contract are sent to `127.0.0.1:11434`; there is no hosted provider fallback.

REGRA rejects models marked as cloud/remote. Model generation may take up to two minutes, and small models will sometimes produce bad repairs. That is why the verification gate is independent of the model.

Using local models removes per-request API fees; you still supply the computer, electricity, storage, and initial model download. The core workflow works without Ollama. Nothing in this project requires buying a coding assistant subscription.

## What counts as verified

All five gates must pass:

1. The new bug test fails on the original code in all three runs.
2. User-supplied existing-behavior checks pass on the original code.
3. The new test passes on the proposed fix in all three runs.
4. All existing checks and saved lessons pass on the proposed fix.
5. Repeated pass/fail outcomes agree and no runner/setup error occurs.

Syntax errors, missing functions, non-JSON results, and timeouts do not count as proof of the reported bug. A test that already passes on the original code is inconclusive. A changed expectation that conflicts with a saved lesson is rejected before execution; intentional behavior changes need a reviewed new contract (use a new project key in v0.1).

This is sampled evidence for the recorded inputs, not a proof of complete correctness. Three runs can catch some flaky tests but cannot establish determinism. The system improves the workflow's memory; the model's weights do not change.

## Storage and privacy

The app and CLI use `.regra/state.json` in the working directory. It contains **code, test inputs, expected outputs, and results**. It is ignored by Git by default; review it before sharing. Export only the lessons or test cases you want to share. There is no automatic upload or community database.

Writes use a lock and an atomic file replacement. A rejected fix creates a run record but no lesson. Repeated verification deduplicates the lesson and retains new verified checks. Corrupt state is reported rather than overwritten. Run history is not automatically pruned in this prototype.

If a crash leaves `.regra/write.lock`, first stop all REGRA app/CLI processes, then remove only that lock file and restart. Do not remove it while verification is running. Copy the data directory for a backup.

## Execution boundary

Run code you have reviewed on a machine you control. The runner uses a child process, Node permissions, a clean environment, fresh VM contexts, timeouts, and output/memory limits. **These are not a security sandbox for hostile code.** Do not expose this prototype as a public code-execution service. An OS/container execution boundary is required before supporting untrusted repository code or public submissions.

The web service binds only to loopback, checks the Host/Origin, and requires a session token for writes. It does not provide a general filesystem or shell-command endpoint.

## Development

```sh
npm test
```

- `src/core.mjs`: contract validation, execution orchestration, gates, lesson matching.
- `src/runner.cjs`: repeated function execution in a restricted child process.
- `src/store.mjs`: persistence and write locking.
- `src/server.mjs`: loopback HTTP service.
- `src/ollama.mjs`: optional local AI draft provider.
- `src/cli.mjs`: developer commands and CI exit codes.
- `public/`: interface with no build step or external assets.
- `tests/`: verification, persistence, regressions and HTTP checks.
- `docs/PRODUCT.md`: product direction and next milestones.
- `docs/VALIDATION.md`: what was actually tested and its limits.

REGRA is the working product name. No package, domain, or trademark registration has been made.
