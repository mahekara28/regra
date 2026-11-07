# Validation record

## Latest checks — 8 November 2026

**Windows · Node 22.23.4 and 24.20.0 · 56 tests passed on each runtime.** TypeScript checking and the fresh-consumer package smoke test also passed on both versions. Package checks used a writable workspace npm cache and allowed missing dependencies to download.

Reproduced **12 failures in the previous 54-test suite** by pointing the temporary-directory environment variables at a Windows junction. Connection assertions expected the original path spelling even though REGRA correctly stored the canonical path. Repository verification rejected snapshot cleanup because the temporary root and its resolved path differed, turning otherwise valid repairs into inconclusive results.

Repository snapshots now use a canonical temporary parent captured before creation. Cleanup still verifies the exact parent, generated name, directory type and resolved location, and refuses symlinks or junctions. Connection assertions compare canonical paths. Two new regressions exercise all four clients through an aliased project path and verify that a repository repair completes, persists its proof and removes its snapshots when the temporary root is aliased. The full 56-test suite passed with that environment on both runtimes.

The README's library example, initialization, demo, agent connection and doctor commands were executed successfully. Its 17 local links/anchors were checked. The evidence image was captured from actual local runs of the bundled average example. Markdown rendering was reviewed on desktop and mobile, with no page overflow at 1100, 768, 390 and 320 pixels.

The existing [hosted run](https://github.com/mahekara28/regra/actions/runs/42405858591) passed on Linux and failed on Windows before these edits. A new hosted result requires the user's manual commit and push; these local checks do not establish that result.

## Initial beta checks — 6 November 2026

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

The verification-desk redesign was checked across all five views at **1440, 1024, 768, 390 and 320 pixels** wide with no horizontal page overflow. Browser checks also covered the contract preview, synchronized line counts, resetting a candidate, Control+Enter verification, clearing stale results, expected/observed output display, decision filters and empty filtered states, and navigating from a retained lesson to its original proof. The 30-test suite passed again after the redesign. No new runtime dependency or external font service was added.

The turquoise/navy theme was checked again through the same browser flow and five screen widths. Desktop and mobile screenshots were inspected. Sampled text/background pairs ranged from **5.97:1 to 15.86:1** contrast; the primary button label measured **9.53:1**, and input borders against their fill measured **3.19:1**. Success, rejection and inconclusive states retain separate green, coral and amber colors and text labels.

A concurrent test run exposed a 200 ms execution limit that was too sensitive to host load. The delivered runner allows one second per evaluation and marks remaining cases unexecuted after a timeout. This preserves an inconclusive result without repeatedly spending the timeout budget.

## Earlier local model check retained from v0.1

The already-installed **qwen2.5:1.5b** model was called through local Ollama. It produced a repair for the average-of-empty-list example. REGRA then executed the original and proposed code: the bug test failed before, passed afterward, and all four existing-behavior checks passed.

The actual draft and full execution record are in `examples/local-ai-proof.json`. The draft was generated locally, not selected from a prepared example. This one successful example does not establish general repair quality.

## Unvalidated scope

This pass did not interactively connect all four actual editor products. Configuration-format tests and protocol calls establish those layers, while the user's agent calling regra_status confirms its own loading/trust setup.

Linux/macOS, every supported Node version, hostile-code isolation, large lesson libraries, whole repositories, external test frameworks and every Ollama model remain unvalidated. This beta supports reviewed synchronous standalone JavaScript. No automatic Context Relay exchange has been implemented.

## Public website

Added the standalone `site/` introduction and playground on 6 November 2026. After this addition, **`npm test`: 33 passed, 0 failed** and **`npm run typecheck` passed** on the Windows/Node 24 environment above.

The three added Node tests cover rejection, verification, lesson retention, scoped replay and regression detection for all three prepared examples; agreement between browser examples, shipped case contracts and the real Node engine; and the public build allowlist, relative assets, anchors, project-path routing, method restrictions and recovery from missing routes. Browser examples do not evaluate arbitrary source text.

Headless Chrome checks passed at **1440, 1024, 768, 390 and 320 pixels**. Checked all three install modes and four client selectors, successful and denied clipboard access, all three demo cases, disabled controls before verification, retention only after passing, regression replay, case switching, reset, reload clearing, stale-result invalidation, downloaded JSON, keyboard activation, skip navigation, native FAQ disclosure, instructions without JavaScript and nested 404 recovery. No horizontal page overflow, runtime errors, missing normal-page assets or third-party requests were observed. The SDK code copied from the actual website was executed with the local library in an isolated scratch project and returned `verified`.

The initial engine-parity test needed validated case IDs, and the clipboard assertion needed Windows CRLF normalization; both test-harness issues were corrected before the successful runs. Desktop, mobile, playground, installation and social-card captures were visually reviewed. The workbench asset is a crop of an actual local-dashboard capture using example data.

The static preview runs under `/regra/`, matching the intended GitHub Pages path. Browser automation used the existing workspace Playwright/Chrome tools and did not add a runtime dependency. The Pages workflow was prepared but has not been run on GitHub or deployed by this task. The GitHub source-install route depends on the current package implementation being pushed; no npm registry release is claimed.

## GitHub deployment follow-up

On 6 November 2026, the website commit `b12513b` was confirmed in the public repository. The [website run](https://github.com/mahekara28/regra/actions/runs/42267693338) passed its site tests but failed at **Configure Pages**. Its check annotation reports `Get Pages site failed` / `HttpError: Not Found` and asks for Pages to be enabled with GitHub Actions as the source. The public website returned HTTP 404 at that check. Enabling Pages is a per-repository setting; Context Relay's Pages configuration does not enable REGRA's site.

The [main CI run](https://github.com/mahekara28/regra/actions/runs/42267693317) passed the tests and typecheck on Ubuntu/Node 24, then failed at `test:package`; the other matrix jobs were cancelled. Public job metadata and annotations were accessible, but raw job logs required repository administrator authentication.

A local reproduction with a new, empty npm cache failed with `ENOTCACHED` while installing the tarball into the clean consumer. The smoke test had forced offline installation, relying on metadata from earlier local installs. It now honors npm's configured cache, allows missing metadata and packages to download, and keeps strict offline mode as an explicit `REGRA_SMOKE_OFFLINE=1` option. The corrected test passed with that fresh cache, including the actual package install, CLI resolution, typed consumer, public library call, project setup, client configuration and MCP discovery/status. The CI matrix now uses `fail-fast: false` so all four platform/runtime results remain visible.

The explicit offline package check also passed after the same cache was populated. The three website tests were rerun successfully and both local servers responded with HTTP 200. These follow-up edits are local until committed and pushed. A passing hosted CI run and public Pages deployment still need confirmation after the relevant push and Pages workflow rerun; the local results do not claim hosted deployment success.

## Earlier public website interface revision

Replaced the public landing page with a light interface, turquoise controls, section navigation and a compact working demo. The first prepared patch executes on load. Patch labels describe the code change, and results report actual counts. The JSON contract can be inspected and copied, installation modes share one concise guide, and the local-dashboard capture opens on request. The social preview and 404 page use the same design. The installed dashboard's own theme and behavior were not changed.

`npm run test:site` passed all three tests, including an added check that copied contracts validate against the installed engine and preserve the shipped examples' project, function and expectations. Browser verification passed at 1440, 1024, 768, 390 and 320 pixels after the final typography changes, with no horizontal page overflow or runtime errors. In addition to the earlier demo, installation and clipboard coverage, the browser check exercised initial execution and its failure count, contract copying, active section navigation, and loading the expanded dashboard capture. The copied SDK snippet still produced a verified result in an isolated project. Desktop, mobile and social-image captures were visually reviewed.

## Wine, silver and lime website revision

On 7 November 2026, replaced the sidebar layout with a short product introduction, a silver repair workspace and a compact installation section. The three CSS 3D layers show the original, proposed patch and retained cases; their cells and counts use the actual prepared-example results. Decorative arrows were removed. The FAQ, first agent prompt and dashboard capture open on demand. The mark, 404 page and social image use the new palette. No runtime dependency was added.

All three site tests passed. The full browser flow passed for all three examples, all four agent selectors and all three install modes. Coverage included actual SDK execution, clipboard success and denial, JSON export, lesson scoping, replay, reset, keyboard navigation, instructions without JavaScript and 404 recovery. No external requests, runtime errors or horizontal overflow were observed at 1440, 1024, 768, 390 and 320 pixels.

Additional browser checks passed for pointer tilt, collapsing the layers, manual pause, live reduced-motion changes, offscreen pause and the hidden-document event signal. The surfaces stayed inside the scene at seven widths from 320 to 1440 pixels. They reflected verified, rejected, retained, replayed, switched and reset demo states. Motion controls are hidden without JavaScript, and motion starts only after initialization. The automated reduced-motion check waits for the browser's media-query change event.

Visual review covered the desktop introduction, mobile introduction, repair workspace, installation and social preview. It caught and corrected face culling after layout changes in Chrome and adjusted the scene's vertical space. The social card was captured from an actual verified and retained prepared example. The changes remain local for the user's manual commit and push; this revision does not establish public deployment success.

## Trusted Node repository adapter — 7 November 2026

Implemented the first milestone from the supplied product-direction document: read-only committed-project discovery, a verification preview, exact Git blob snapshots, a Node test-runner adapter, repair/regression gates, local proof records, typed APIs and bounded MCP inspection/plan/evidence summaries. The public website and installed dashboard were not redesigned in this milestone.

The complete local suite passed: **51 tests, 0 failures**, on **Windows / Node 24.20.0 / Git 2.55.0.windows.5**. TypeScript checking also passed. The repository fixtures are actual temporary Git repositories with committed baselines and candidates. They cover correct repairs, incomplete fixes, reintroduced bugs, newly added reproducer tests applied to old code, immutable revisions, preserved dirty worktrees and staging, stale previews, altered/deleted tests, fixture changes, changed test commands/dependencies, empty/skipped/TODO tests, missing imports, unsupported runners, timeouts, flaky results and tests that rewrite their own contract.

An initial missing-import test exposed a diagnostic classification problem: the run was already inconclusive, but labeled as no executed tests. Failed test-file loading now reports a setup failure. The targeted checks passed after the correction. No setup failure was accepted as a repaired bug.

MCP tests used an actual SDK client to inspect a Git fixture, retrieve its plan and read a saved repository proof. Strict input validation rejected execution/trust arguments, and the read-only calls created no extra proof. Existing function verification, lesson retention, connection configuration, HTTP service and public website tests remained passing.

After the final assertion-detail and runtime-metadata refinements, three targeted integration tests passed again. They exercised repair/rejection/recurrence with observed and expected assertion values, six independent lockfile installs with lifecycle scripts demonstrably disabled, Node/Git/npm version records, quoted test paths containing spaces and refusal of linked Git objects. Discovery also ran successfully against this REGRA checkout and explicitly reported that uncommitted files were excluded.

The package smoke check passed using a populated workspace npm cache in explicit offline mode. It verified all repository adapter/helper files in the tarball, fresh consumer installation, public import and declarations, CLI, project setup, client configuration and real MCP discovery/status. This was a fresh consumer using cached dependencies, not a fresh network download or an npm publication.

No runtime dependency, paid API or cloud service was added. Repository execution is opt-in for reviewed, trusted host code; snapshots and environment filtering are not OS-level isolation. The fixtures do not replace the planned 20–30 independently reviewed real-bug evaluation. Linux, Node 22 and hosted CI results still need their configured matrix runs. Durable repository lesson replay, automatic hook/workflow setup, bug-to-test UI, broader adapters and hostile-code isolation remain documented next stages. No changes were committed, pushed or published by this task.

## Website themes and repository workflow — 8 November 2026

Refreshed the public website with self-hosted Instrument Sans, day/night appearances, theme-aware demo tables and verdicts, refined hover/focus states, a four-stage repository workflow, and a Repository CLI installation option. Existing prepared examples and the result-driven 3D scene are preserved. The page describes current repository capabilities and distinguishes them from planned durable repository lessons.

`npm run test:site`: **6 passed, 0 failed**. The added tests run the actual theme bootstrap and cover system preference before DOM readiness, explicit persisted choice, denied storage, invalid stored values, cross-tab updates and clearing the preference. The build/route test now also checks JavaScript and font MIME types. `git diff --check` passed. The backend was not changed or revalidated in this website-only pass.

Headless Chrome checks passed in **both themes at 1440, 1024, 800, 768, 520, 390 and 320 pixels**. Coverage includes system changes, keyboard toggling, persistence across reloads, real cross-tab synchronization, blocked storage, recovery-page appearance, all four workflow panels, exact clipboard commands, workflow keyboard navigation and the repository installation route. Without JavaScript, the system appearance and all four workflow stages remain readable. No horizontal page overflow or runtime errors were observed. A solid-background contrast check passed for visible enabled text in both appearances and all four installation modes; this is not a claim of a complete accessibility audit.

The existing browser suite also passed for all three prepared cases, four agent selectors, library/dashboard setup, actual execution of the copied SDK example, verification/retention/replay/export/reset, denied clipboard access, skip navigation and 404 recovery. The scene suite passed pointer tilt, layer collapse, manual pause, live reduced-motion changes, offscreen/hidden-document pause, actual-result synchronization, lesson scoping and physical bounds at seven widths. No third-party requests or decorative arrow glyphs were observed.

Desktop, mobile and repository-section captures were reviewed. The social image was updated from an actual verified and retained browser example. No frontend dependency, external font service, paid service, commit, push or deployment was added. The changes are prepared for the user's manual GitHub commits; see [WEBSITE_COMMITS.md](WEBSITE_COMMITS.md).

## Black canvas and simplified hero — 8 November 2026

The public website now defaults to a pure black (`#000000`) canvas with charcoal panels and neutral silver layers. An explicitly saved day-mode choice is preserved. Removed the hero's duplicate result status, Motion/Layers checkboxes, filename strip, background glow and release badge. The graphic has no automatic animation; its pointer tilt respects reduced motion and resets offscreen, on pointer leave and when the document is hidden. Actual test verdicts remain available in the working demo.

All **6 website tests passed** with updated default-theme and persistence expectations. Browser checks passed for the black default under a light OS preference, both appearances at seven widths (320–1440 pixels), saved choices, real cross-tab synchronization, denied storage, no-JavaScript black fallback, workflow navigation and copied commands. The scene stayed within its bounds at all seven widths, with no removed controls or status strip in the DOM and no runtime errors.

The existing demo/installation browser suite passed all three examples, four agent selectors, library execution, retention/replay/export/reset, successful and denied clipboard access, keyboard navigation and recovery routes. Solid-background text contrast passed in both themes across all four installation modes. Desktop, mobile, full-page and social captures were reviewed. No backend behavior changed; no commit, push or deployment was performed.
