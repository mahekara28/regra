# Validation record

Checked on **6 November 2026**, for **0.2.0-beta.1**, on Windows with **Node.js v24.20.0** and npm 11.19.0.

## Automated checks

`npm test`: **30 passed, 0 failed, 0 skipped**. `npm run typecheck` passed.

Covered behavior:

- The failing original and correct repair produce independently observed before/after outcomes.
- A repair that stops a crash but breaks other outputs is rejected.
- A passing original test cannot be represented as a reproduced bug.
- Syntax errors, missing entry points, timeouts and unsupported outputs are inconclusive.
- Expected exceptions match by error name.
- Inputs are fresh for each case and expected outputs stay outside the evaluated code context.
- Contradictory expectations and invalid specifications are refused.
- Lessons survive reopening, deduplicate, and catch a later reintroduced regression.
- Corrupt stored history is preserved instead of overwritten.
- Previously saved expectations cannot be silently weakened.
- All three guided examples accept the correct repair and reject the prepared bad repair.
- HTTP routes enforce session, Origin and Host checks, persist real evidence, and export lessons.
- CLI checks enforce committed cases, avoid duplicate tests, and return meaningful process exit codes.
- Public package imports verify, persist and replay evidence without a web server; project instances cannot read another project's evidence.
- Initialization is repeatable, preserving project identity and edited example files.
- Missing and non-directory project paths give recovery instructions; initialization does not create an unintended project directory. The dashboard folder check requires the session token and accepts only existing absolute folder paths.
- All four client formats preserve unrelated settings on preview, install, repeat setup and disconnect; conflicts and outside edits are refused.
- Moved installation paths are reported as stale, and disconnect/reconnect repairs them.
- Unsupported command flags, including a misleading dry-run on disconnect, fail before any mutation.
- Case files with the wrong project, traversal and symlink paths are refused.
- A real official-SDK MCP client discovers all five tools, rejects an incomplete fix, verifies the correct fix, retrieves proof, and catches a later regression.
- MCP verification rejects inline replacement expectations and a contract changed since context retrieval.
- Resources, prompts, a 2025-era initialize exchange and doctor protocol discovery/status calls work.

## Fresh package installation

`npm run test:package` passed with the populated workspace npm cache. It created an actual npm tarball, checked its contents, installed into a clean consumer offline, resolved the CLI binary, imported the public JavaScript API, compiled a TypeScript consumer against the packed declarations, initialized a project, configured a client and performed real MCP discovery/status calls from the installed package.

The initial smoke run encountered a restricted default Windows npm cache. The successful rerun explicitly used the workspace cache. No registry publication, global installation or real editor configuration was performed during testing.

The GitHub Actions workflow is configured for Node 22/24 on Windows/Linux. Those hosted jobs have not run yet; they will run after the changes are pushed.

## Browser checks

Headless Google Chrome, desktop **1440 × 1040**, mobile **390 × 844**.

Exercised the real interface: reject a broken fix, verify a correct fix, persist and reopen history, search the library, inspect a past run, download proof, clear stale evidence after edits, explain invalid JSON, switch into custom mode, use all three examples, and verify on mobile. The Connections page was checked for client selection, rejection of a missing folder, acceptance of an existing folder, Windows paths containing spaces/apostrophes, PowerShell/Bash quoting and desktop/mobile layout. Checked horizontal overflow and browser runtime errors. Connection-screen screenshots were visually inspected at both sizes.

Browser automation is a development check, not a runtime dependency of the delivered app. It used the workspace's existing Playwright installation.

A concurrent test run exposed a 200 ms execution limit that was too sensitive to host load. The delivered runner allows one second per evaluation and marks remaining cases unexecuted after a timeout. This preserves an inconclusive result without repeatedly spending the timeout budget.

## Earlier local model check retained from v0.1

The already-installed **qwen2.5:1.5b** model was called through local Ollama. It produced a repair for the average-of-empty-list example. REGRA then executed the original and proposed code: the bug test failed before, passed afterward, and all four existing-behavior checks passed.

The actual draft and full execution record are in `examples/local-ai-proof.json`. The draft was generated locally, not selected from a prepared example. This one successful example does not establish general repair quality.

## Unvalidated scope

This pass did not interactively connect all four actual editor products. Configuration-format tests and protocol calls establish those layers, while the user's agent calling regra_status confirms its own loading/trust setup.

Linux/macOS, every supported Node version, hostile-code isolation, large lesson libraries, whole repositories, external test frameworks and every Ollama model remain unvalidated. This beta supports reviewed synchronous standalone JavaScript. No automatic Context Relay exchange has been implemented.
