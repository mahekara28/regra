# REGRA — product direction

**Every fix earns its proof.**

REGRA is an executable memory layer for coding workflows. It turns bugs into replayable tests, uses those tests to challenge proposed changes, and returns useful lessons to whichever assistant is writing the next change.

The promise should be: **“Known mistakes become checks you can run.”** Avoid promising that the model becomes intrinsically smarter or that every future mistake will be caught.

## Who it serves

Start with solo developers, students, and small teams already using coding assistants. They have a frequent, concrete problem: a generated patch looks convincing, but they cannot easily tell what it broke or whether the same bug has returned.

Beginners get an app that says what failed in plain English. Developers get a local CLI, structured results, test artifacts they can commit, and exit codes that can block a failing change. Both use the same engine and evidence.

“Easy for everyone” should mean everyone can understand the result, not that everyone must learn JSON or that every non-developer is the initial customer.

## Product loop

| Moment | User sees | System must establish |
| --- | --- | --- |
| Capture | “Here is what broke.” | Minimal input, actual result, intended result, reproducible failure |
| Define | “Here is what should happen.” | A human-reviewed contract, separate from the repair |
| Repair | “Here is a proposed change.” | A draft from any assistant, with no automatic claim of success |
| Verify | “Fixed / rejected / could not verify.” | Failure before, success after, existing behavior preserved |
| Retain | “This behavior is protected.” | Executable case, provenance, runtime, code fingerprints |
| Reuse | “A previous lesson applies here.” | Match relevant lessons, inject context, replay before acceptance |

This builds on regression testing, test-driven development, and automated repair. Its product opportunity is reducing the work needed to turn a real failure into a durable, reviewable contract across assistant workflows. Novelty must be demonstrated through usability and measured results, not claimed from the loop alone.

## Practical improvements beyond the original idea

1. **A bug receipt.** One readable evidence record containing the trigger, expected behavior, before/after outputs, code revision, runtime, and final decision. Implemented in the prototype as a downloadable proof record.
2. **Tests that cannot disappear during a repair.** Keep the approved behavior contract outside the proposed code. The prototype separates JSON expectations from snippets and blocks conflicting historical expectations. Repository adapters will also need to reject deleted, skipped, or weakened tests and verify the evaluator itself.
3. **An honest uncertainty state.** “Could not verify” for broken environments, timeouts, inconsistent runs, missing tests or ambiguous requirements. Never turn those into a green pass.
4. **Lessons that return at the right time.** Start with project and function identity. Add file paths, stack signatures, language and tags before adding embedding search. Exact matches are cheap, explainable, and useful.
5. **Agent-independent context.** A concise behavior contract can be handed to any coding assistant. The npm library and MCP server now share the same engine, cases and evidence. Project setup supports Cursor, Claude Code, Codex and VS Code configuration formats. Changing models should not erase the test library.
6. **Failure minimization.** Later, shrink a large failing input into a small reproducer and ask the user to confirm the intended output. Smaller cases are easier to understand and maintain.
7. **Nearby edge cases.** Later, propose boundary cases such as empty, missing, duplicate, zero, maximum-length and Unicode inputs. Users confirm semantics before these become mandatory checks.
8. **Local ownership and explicit sharing.** Keep source and failures local. Shared packs should initially be synthetic patterns and reviewed generic tests, not automatic uploads of proprietary source or production records.

## Delivered: library, MCP, CLI and optional app

The v0.2.0-beta.1 checkout adds a typed npm library, project-scoped MCP tools, reversible connection setup, a real protocol doctor and an optional connection guide in the dashboard. The v0.1 verification engine, lesson history, three guided examples and optional local Ollama drafts remain available. Publication to npm is a separate owner action.

The everyday path is **install → init → connect → doctor**. After restarting the agent, users ask for `regra_status`, retrieve context and verify a proposed repair against an existing case. Configuration is distinct from a confirmed live agent connection. A rejected or inconclusive result never grants approval. A case fingerprint detects changed expectations between retrieval and verification; it does not prove a person reviewed them.

The library is the reusable product core. MCP is the standard agent connection. The dashboard makes results and setup easier to understand without becoming a required service. There is no hosted account or paid provider dependency.

It deliberately has no model training, vector database, user accounts, billing, multi-language runners, automatic deployment, browser extension, or team cloud service. Those would add maintenance and cost before the central workflow is proven.

The next usability improvement should replace the custom JSON test editor with a table: **input / expected output / reason**. Preserve JSON import/export for developers. Then add “paste error + select function” to draft a test, with a review step before verification.

## Release sequence and acceptance criteria

| Stage | Deliverable | Ready when |
| --- | --- | --- |
| 0.1: prove the loop (delivered) | Local app and CLI | A broken fix is rejected, a correct fix is accepted, and a later regression is blocked after restart |
| 0.2: connect (implemented, unpublished beta) | npm library, MCP server, setup commands, doctor, connection screen | A fresh package consumer imports the API, starts MCP and retrieves real verification evidence |
| Current local milestone: trusted Node repositories | Node test-runner adapter, exact Git snapshots, frozen tests, structured proofs | Correct repairs and recurrence pass the conformance fixtures; altered tests, empty/skipped tests, setup failures, timeouts and flaky results fail closed. Host execution requires explicit trust; OS/container isolation remains future work |
| Then: smoother workflow | Visual test editor, relevant case suggestions, CI evidence reports | Developers maintain reviewed checks with little setup; required CI fails closed on missing or failed checks |
| Later: expand | Python/pytest, browser reproduction with Playwright, intent-aware test migrations | Each adapter passes an identical conformance suite and distinguishes application failure from infrastructure failure |
| Later: share carefully | Versioned public failure-pattern packs and optional team service | Provenance, secret review, version compatibility, trust boundaries and moderation are explicit |

For repository support, reproduce baseline and candidate in disposable snapshots, pin dependencies/environment where practical, prevent agent writes to the evaluator, and record the exact executed revision. Review changes before applying or merging them. Do not label a host process or `vm` context a secure sandbox.

The current [repository adapter](REPOSITORIES.md) supports committed standalone JavaScript projects through the library and CLI. MCP can inspect plans and read proof summaries; it cannot authorize repository execution. Durable repository lessons, automatic CI/hooks, bug-to-test forms, stronger isolation and the real-bug evaluation remain on the [staged implementation plan](IMPLEMENTATION_PLAN.md). Existing function lessons continue to work independently.

## How to evaluate it

Begin with 20–30 real, small bugs from one language and test framework. For each, retain the known broken revision, reviewed regression case, accepted repair, and a plausible but incomplete repair.

Measure:

- **Bad-fix rejection rate:** incomplete fixes blocked / incomplete fixes attempted.
- **Known-bug recurrence caught:** deliberate reintroductions blocked / reintroductions attempted.
- **False rejection rate:** independently reviewed correct fixes blocked / correct fixes attempted.
- **Time to usable reproducer:** median human time from report to a test that fails for the right reason.
- **Review burden:** how often users must rewrite a generated test or clarify the expected behavior.
- **Verification latency and reproducibility:** runtime, infrastructure failures, and inconsistent results.

Do not advertise “bugs prevented” based only on saved test counts. Do not use a model's own confidence score as evidence. Compare against an ordinary regression-test workflow to show where REGRA saves work.

## Cost model

| Component | Initial choice | Cost boundary |
| --- | --- | --- |
| App + verification | Node.js, local files, plain browser UI | No service subscription or dependency fees; uses existing hardware |
| AI drafting | Optional local Ollama model | No per-request API fee; download size, electricity, model license and hardware still matter |
| Storage | Local JSON in v0.2; SQLite when history grows | No hosted database bill |
| Source + collaboration | Git; optional GitHub | Local Git is sufficient; hosted service limits apply |
| CI | Existing local runner or standard GitHub Actions | Public repositories have free standard hosted runners; private usage has plan allowances |
| Distribution | npm-compatible package, local source install; public npm release planned | No domain or app-store purchase needed for local use |

Free to run locally does not mean unlimited free hosted compute. Avoid depending on a temporary free inference tier. A later hosted offering would need an explicit compute budget or user-funded execution.

## Technical shape

```text
JavaScript/TypeScript library / MCP / CLI / local app
                  |
           verification engine
            /             \
 reviewed contracts      runtime adapter
 + lesson library        + evidence capture
            \             /
              acceptance gate
                  |
       saved lesson + proof record
```

The AI drafts code or test candidates. The deterministic engine evaluates the reviewed contract. Model adapters should stay replaceable and optional.

## Relationship to Context Relay

[Context Relay](https://github.com/mahekara28/context-relay) carries reviewed project context between sessions and agents. REGRA carries executable cases and the evidence behind a verification decision. Both use a reusable package, project-scoped setup, MCP and diagnostics.

Keep them independently useful. A Context Relay handoff can refer to a REGRA proof ID and code fingerprint, but direct automatic exchange between the projects is not implemented. A later explicit adapter could include the case fingerprint, before/after fingerprints, result and proof location in a handoff. It should never turn a remembered success into fresh verification of different code.

## Name and language

**REGRA**: five letters; associated with regression tests and rules. Working tagline: **Every fix earns its proof.**

Use “lesson,” “check,” “verified for these tests,” and “needs review” in the beginner interface. Reserve “regression,” “reproducer,” and “runtime adapter” for developer detail. Avoid “self-improving intelligence,” “guaranteed correct,” and unexplained confidence percentages.

## Sources checked on 6 November 2026

- [Ollama API authentication](https://github.com/ollama/ollama/blob/main/docs/api/authentication.mdx): local API does not require a cloud API key.
- [Ollama structured outputs](https://registry.ollama.com/blog/structured-outputs): request structured drafts for review and validation.
- [GitHub Actions billing and usage](https://docs.github.com/en/actions/concepts/billing-and-usage): standard public-repository runners and self-hosted runner billing conditions; private allowances vary by plan.
- [Node permissions](https://nodejs.org/api/permissions.html): permissions are not a security guarantee against malicious code.

Provider plans and APIs can change. The core prototype works without a hosted provider.
