# JavaScript and TypeScript API

Package: `@mahekara28/regra`. Node.js 22.13+. ESM imports. The library runs in Node; the dashboard talks to a local service.

```js
import { createRegra, summarizeRun } from '@mahekara28/regra';
const regra = createRegra({ project: 'my-app', directory: '/path/to/project/.regra' });
```

Use an explicit directory when your agent changes working directories. Instances are scoped to one project. A specification with another project key is refused. Importing the package starts no server and writes no files.

| Method | Result | Writes |
| --- | --- | --- |
| `verify({ spec, before, after })` | Full before/after proof | Evidence; a lesson only on success |
| `check({ source, spec })` | Supplied contract plus saved cases | None |
| `check({ source, entry })` | Saved cases; inconclusive if there are none | None |
| `lessons({ entry?, query?, limit? })` | Matching lessons, total, truncation indicator | None |
| `context({ entry?, query?, limit? })` | Executable contracts and workflow guidance | None |
| `evidence(runId)` | Stored proof for this project | None |
| `status()` | Runtime and counts | None |

Filters use exact function identity and simple case-insensitive text matching. The default limit is 20, maximum 100. Use `summarizeRun(run)` for compact agent results with gates, failures, hashes, and `canProceed`.

## Contract

```ts
import type { ScopedSpec } from '@mahekara28/regra';
const spec: ScopedSpec = {
  entry: 'average', title: 'Empty input returns zero',
  repro: { name: 'Empty', args: [[]], expect: 0 },
  checks: [{ name: 'Numbers', args: [[2, 4]], expect: 3 }]
};
```

Each case needs exactly one of `expect` or `throws`. At least one existing-behavior check is required. The reproducer must fail before the repair, while existing checks pass. Historical cases are replayed; conflicting expectations are refused.

Review expectations independently of the repair. The library accepts the caller's contract; it cannot establish who reviewed it.

## Your own agent pipeline

```js
const context = await regra.context({ entry: spec.entry });
const candidate = await yourAgent.proposeRepair({ before, spec, context });
const proof = await regra.verify({ spec, before, after: candidate.code });
if (proof.status === 'verified') {
  await yourReviewQueue.add({ code: candidate.code, proofId: proof.id });
} else {
  await yourAgent.showFailures(summarizeRun(proof));
}
```

`yourAgent` and `yourReviewQueue` are application-specific placeholders. No model client is required by REGRA. Verification never applies or merges code.

## Stateless use

```js
import { verify } from '@mahekara28/regra';
const proof = await verify({ spec: { ...spec, project: 'my-app' }, before, after });
```

This executes without saving a store. Pass `lessons` explicitly to replay existing lesson objects. Prefer the service for persistence and scoping.

## Decisions and limits

`verified` means the recorded gates passed; `rejected` means behavior failed; `inconclusive` means reproduction/setup/repeatability did not establish a usable result. Invalid input, corrupt storage, lock conflicts and process failures reject the Promise. Treat exceptions as blocked decisions.

`check` and `summarizeRun` expose `canProceed`; only verification success sets it true. Fingerprints are not signed third-party attestations. Three repeated runs sample repeatability, not complete correctness.

The adapter accepts reviewed synchronous standalone JavaScript function declarations with JSON values or named thrown errors. No imports, exports or promises. Public exports hide low-level execution primitives. Node permissions and `vm` are not hostile-code isolation.
