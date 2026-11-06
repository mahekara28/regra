# REGRA

**Every fix earns its proof.**

Executable memory for coding agents. A reproducible bug becomes a test; a proposed fix must pass it and preserve earlier behavior. Verified lessons stay available across agent sessions.

Use REGRA as a **JavaScript/TypeScript library**, **local MCP server**, **CLI**, or **browser dashboard**. All four share one verification engine and evidence store. REGRA does not retrain models.

> **Release status:** this checkout contains `0.2.0-beta.1`, not yet published to npm. Use the local installation below. GitHub installation requires pushing these changes first; registry installation requires a separate npm release.

## Connect an agent

Requires **Node.js 22.13+**. From this updated REGRA checkout, install once:

```sh
npm ci
npm install -g .
```

Then open a terminal in the project you want to protect:

```sh
regra init --root . --demo
regra connect --client cursor --root .
regra doctor --root .
```

Replace `cursor` with **`claude`**, **`codex`**, or **`vscode`**. `--demo` adds a teaching case and example functions; omit it for an empty setup. `--project my-app` sets an explicit project key at initialization.

Restart the agent in that project and accept its normal MCP/trust prompt. Ask:

> Call regra_status and regra_context. Inspect the average case and its expected behavior. Verify the original and fixed functions in regra-examples using the caseFile and caseHash returned by context. Show me the result and proof ID.

The agent starts REGRA over stdio. **No dashboard server, API key, model download, or Ollama installation is needed for MCP.** Your agent supplies its own model.

To try setup in this REGRA checkout without a global install, run from the REGRA folder. The dot means your current folder:

```powershell
node src/cli.mjs init --root . --demo
node src/cli.mjs connect --client codex --root .
node src/cli.mjs doctor --root .
```

For another project, replace the dot with that project's existing folder path in quotes. REGRA adds its files inside an existing project; it does not create a new project directory. The dashboard's **Connections** page checks the folder and generates commands with absolute paths. See [connection guide](docs/CONNECTIONS.md).

## Import the library

Install this checkout in another Node project:

```sh
npm install --save-dev /absolute/path/to/regra
```

After the updated code is pushed, users can install directly from GitHub:

```sh
npm install --save-dev github:mahekara28/regra
```

```js
import { createRegra } from '@mahekara28/regra';

const regra = createRegra({ project: 'my-app', directory: '.regra' });
const proof = await regra.verify({
  spec: {
    entry: 'average', title: 'Empty input returns zero',
    repro: { name: 'Empty', args: [[]], expect: 0 },
    checks: [{ name: 'Numbers', args: [[2, 4]], expect: 3 }]
  },
  before: 'function average(xs) { return xs.reduce((a,b) => a+b) / xs.length; }',
  after: 'function average(xs) { return xs.length ? xs.reduce((a,b) => a+b, 0) / xs.length : 0; }'
});

if (proof.status !== 'verified') {
  // Return the failing evidence to your agent for another repair.
}
const lessons = await regra.context({ entry: 'average' });
```

TypeScript declarations ship with the package. Imports start no server and write no files. The engine needs no model. See [API reference](docs/API.md) and [runnable example](examples/library.mjs).

## Agent tools

| MCP tool | Purpose |
| --- | --- |
| `regra_status` | Identify the scoped project, runtime and evidence counts |
| `regra_context` | Retrieve lessons and case files with contract fingerprints |
| `regra_verify` | Check original/proposed code against an existing case; retain proof and verified lessons |
| `regra_check` | Replay a contract and saved lessons against current code |
| `regra_evidence` | Retrieve the exact recorded proof by ID |

There is also a project status resource and a `repair_with_regra` prompt. Compatibility is tested with the current official SDK and a 2025-era initialize exchange.

**MCP makes tools available; it does not force an agent to use them.** For enforcement, run the CLI check in CI and require that check in repository settings. REGRA does not apply patches, merge, or push code.

## Verification rules

All five gates must pass: reproduce the failure on the original; confirm existing checks pass before the change; pass the new case after the change; preserve existing checks and saved lessons; and obtain consistent pass/fail results on three runs with no setup errors.

A syntax error, missing function, timeout, unsupported result or non-reproducing case is **inconclusive**. A repair that fails behavior checks is **rejected**. Only a **verified** before/after result creates a lesson.

MCP verification requires a file in `regra-cases/` and its `caseHash` from context. A changed contract or inline replacement expectation is refused. The hash detects changed data; it does not establish human review. A person must review intended behavior, and an agent with other filesystem tools still has the access its host grants.

## Current scope

Reviewed, self-contained **synchronous JavaScript function declarations**, with JSON inputs/results or named thrown errors. No imports, exports, browser APIs, promises, package dependencies, dates, undefined, non-finite numbers, or cyclic results. Equality is exact, including floating-point numbers.

`args: [[]]` means one empty-list argument. `expect: 0` requires a zero result; use `throws: "TypeError"` instead for an expected error. Returning zero for an empty average is a chosen demo rule, not a universal mathematical definition.

**Whole-repository test execution, Python, browser tests, and arbitrary shell commands are not implemented.** Three repeated runs sample repeatability; tests cover only their recorded behavior.

## Dashboard and CLI

From the clone: `npm start`, or double-click `Start-Regra.cmd` on Windows after installing dependencies. From an installed package:

```sh
regra ui --root /path/to/project
```

Open **http://127.0.0.1:4317**. Compare a prepared bad fix and correct fix, inspect lessons, and use Connections for setup. Optional AI drafts use installed local Ollama models and never bypass verification.

```sh
regra connect --client claude --root . --dry-run
regra connections --root .
regra disconnect --client claude --root .
regra verify --root . --case regra-cases/average.case.json --before regra-examples/average.before.js --after regra-examples/average.fixed.js
regra check --root . --case regra-cases/average.case.json --source regra-examples/average.fixed.js
regra lessons --json
regra context --project my-app
```

From the clone, replace `regra` with `node src/cli.mjs`. `--root` sets relative paths and default evidence storage. Standalone CLI commands also accept `--store PATH`; MCP uses its initialized project's store. Exit codes: **0** passed/success, **1** rejected/inconclusive or failed doctor, **2** setup error. Add `--json` for structured results. `check` uses the provided case even on a fresh machine without history.

## Connections, storage and cost

Connection setup preserves other settings and JSON comments, refuses conflicts, and removes only its managed entry on disconnect. It changes project-local configuration, not global settings. Entries contain absolute paths for this machine; keep the installed package in place and reconnect if it moves. Each teammate runs setup locally. Doctor checks the protocol but does not observe whether an editor loaded REGRA.

| File | Purpose |
| --- | --- |
| `regra.config.json` | Project identity; commit it |
| `regra-cases/*.case.json` | Reviewed contracts; commit after reviewing their data |
| `REGRA.md` | Short agent workflow guide |
| `.regra/state.json` | Code, inputs, results and lessons; ignored by Git |
| `.regra/connections.json` | Machine-specific managed entry records; ignored by Git |

No REGRA account, hosted database, paid API or subscription is required. Execution uses your computer. A connected coding agent keeps its existing account/provider costs; Ollama is optional.

Evidence uses locked, atomic writes. Corrupt history is preserved and reported. If a crash leaves `write.lock` or `connections.lock` under `.regra`, stop all REGRA processes using the project before removing only the stale lock. History is not automatically pruned. Review source and inputs before exporting.

The runner uses a child process, fresh VM contexts, Node permissions and resource limits. **These are not a security sandbox for hostile code.** Use reviewed code locally; an OS/container boundary is needed before public or untrusted repository execution. MCP paths reject traversal and symlinks, while the local owner still controls files on disk.

## With Context Relay

[Context Relay](https://github.com/mahekara28/context-relay) carries reviewed working context between sessions. REGRA contributes executable checks and proof IDs. Include those references in a handoff so the next agent can retrieve evidence. No automatic cross-application delivery is implemented, and neither project depends on the other.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run test:package
```

The package smoke check packs, installs into a fresh consumer using the npm cache, imports the API, checks TypeScript declarations, runs the CLI, and performs real MCP discovery. Run `npm ci` first to populate the cache.

The GitHub Actions workflow runs these checks on Windows and Linux with Node 22 and 24 when you push. Local validation results and remaining platform limits are recorded in [Validation](docs/VALIDATION.md).

[API](docs/API.md) · [Connections](docs/CONNECTIONS.md) · [Product direction](docs/PRODUCT.md) · [Validation](docs/VALIDATION.md) · [Release steps](docs/RELEASING.md)

MIT licensed. Preparing this release does not publish it or register a domain/trademark.
