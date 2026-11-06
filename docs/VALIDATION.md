# Validation record

Checked on **6 November 2026**, on Windows with **Node.js v24.20.0**.

## Automated checks

`npm test`: **14 passed, 0 failed, 0 skipped**.

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

## Browser checks

Headless Google Chrome, desktop **1440 × 1040**, mobile **390 × 844**.

Exercised the real interface: reject a broken fix, verify a correct fix, persist and reopen history, search the library, inspect a past run, download proof, clear stale evidence after edits, explain invalid JSON, switch into custom mode, use all three examples, and verify on mobile. Checked horizontal overflow and browser runtime errors. Desktop and mobile screenshots were visually inspected.

Browser automation is a development check, not a runtime dependency of the delivered app. It used the workspace's existing Playwright installation.

A concurrent test run exposed a 200 ms execution limit that was too sensitive to host load. The delivered runner allows one second per evaluation and marks remaining cases unexecuted after a timeout. This preserves an inconclusive result without repeatedly spending the timeout budget.

## Local model check

The already-installed **qwen2.5:1.5b** model was called through local Ollama. It produced a repair for the average-of-empty-list example. REGRA then executed the original and proposed code: the bug test failed before, passed afterward, and all four existing-behavior checks passed.

The actual draft and full execution record are in `examples/local-ai-proof.json`. The draft was generated locally, not selected from a prepared example. This one successful example does not establish general repair quality.

## Unvalidated scope

This pass did not validate Linux/macOS, every supported Node version, hostile-code isolation, large lesson libraries, whole repositories, external test frameworks, or every Ollama model. Those are outside this prototype's validated scope. Its restriction to reviewed synchronous standalone JavaScript is documented in the README.
