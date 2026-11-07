# REGRA implementation plan

Based on the supplied product direction, 7 November 2026.

## 1. Real repository verification — implemented locally

Deliver a local Node test-runner adapter through the typed library and CLI. MCP can inspect the project and read plans/evidence; executing repository code requires an explicit trusted-code choice through the CLI or library.

| Files | Work | Acceptance |
| --- | --- | --- |
| `src/repository/snapshot.mjs` | Detect committed Node projects; resolve Git revisions; export exact blobs to disposable snapshots | No checkout/index changes, no Git hooks/filters, no symlink/submodule traversal; working changes are reported but never silently included |
| `src/repository/node-worker.mjs`, `process.mjs` | Execute the same frozen Node test files in fresh processes and snapshots | Bounded output/time; no inherited Node loaders; missing imports, empty tests and setup failures cannot pass |
| `src/repository/index.mjs` | Shared repair/check policy, repeatability, contract fingerprints and JSON proof records | A reproduced failure becomes passing, earlier passing behavior stays passing, and modified/deleted/skipped tests never count as an accepted repair |
| `src/cli.mjs`, `src/index.mjs`, `src/index.d.ts` | Inspect, preview, verify, check and evidence interfaces | Plain-English output and typed JSON agree; non-passing results have nonzero exit codes |
| `src/mcp.mjs` | Read-only repository inspection, planning and proof retrieval | The agent cannot enable host repository execution through a tool argument |
| `tests/repository.test.mjs`, existing CLI/MCP/type tests | Small real Git histories with deliberate bugs | Correct repair accepted; incomplete fix and recurrence blocked; setup, timeout, flake, contract changes and missing tests fail closed |

The first adapter supports committed JavaScript projects with a plain `node --test` command, or conventional Node test files when no script is configured. It does not execute arbitrary npm scripts. Dependency installation is optional, lockfile-based and disables lifecycle scripts. Snapshots protect the checkout from ordinary test writes; they are **not a hostile-code sandbox**. Untrusted code needs OS/container isolation before automatic execution.

## 2. Automatic checks and durable repository lessons — next

- Add reviewed CI and hook templates; preview before writing configuration, preserve existing hooks and use pull-request base revisions.
- Save reusable repository contracts with their originating proof; replay and report original proof IDs on recurrence.
- Surface matching file/symbol/error fingerprints before agent edits.
- Acceptance: a fresh CI checkout blocks a deliberately reintroduced bug and distinguishes a failure from unavailable evidence. Existing hooks and unrelated configuration remain intact.
- Likely files: repository engine/store, `src/automation.mjs`, `docs/CI.md`, versioned workflow templates, repository/CLI integration tests.

## 3. First five minutes and bug-to-test — after the adapter

- One setup command: read-only detection, concrete preview, one approval, managed writes and a real self-check.
- Add “what you tried / what happened / what should happen” to the dashboard with advanced JSON still available.
- Use deterministic error/path extraction before optional Ollama drafting. Ambiguous expectations require review; the proposed reproducer must fail on the baseline.
- Acceptance: a beginner completes a real verified repair without manually writing JSON; a changed expectation or failed setup cannot silently pass.
- Likely files: `src/project.mjs`, `connections.mjs`, `doctor.mjs`, new draft module, `public/`, browser and connection tests.

## 4. Measure, then expand

- Collect 20–30 small, independently reviewed real bugs and compare against ordinary regression tests.
- Record bad-fix rejection, recurrence detection, false rejection, runtime and human effort. Prepared fixtures are conformance tests, not evidence of broad product effectiveness.
- Stabilize the adapter contract before Vitest/Jest and then Python/pytest. Add browser/API adapters only with equivalent acceptance and isolation coverage.
- Keep JSON until measured scale or concurrency warrants SQLite. No mandatory cloud API, paid service, account system, vector database or source uploads.

## Release boundaries

Keep npm publication, Git commits/pushes and hosted deployment under the owner's control. Mark each implemented scope and each remaining limitation in the repository guide and validation record. A passing local test is not confirmation of every supported platform, real editor version or hosted CI runner.
